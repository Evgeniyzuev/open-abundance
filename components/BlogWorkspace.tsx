"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import FeedPostGallery, { getFeedPostCover, getFeedPostTitle } from "@/components/FeedPostGallery";
import ProtectedImage from "@/components/ProtectedImage";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";
import { BLOG_PAGE_SIZE, mergeBlogPosts } from "@/lib/blogWorkspace";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import type { FeedExternalLink, FeedMedia, FeedPayload, FeedPost } from "@/lib/socialFeed";
import { SHARE_TO_OA_ENABLED } from "@/lib/shareToOA";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const { data, error } = await getBrowserSupabaseClient().auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error("Please sign in again.");
  const response = await fetch(url, {
    ...init, cache: "no-store", signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${data.session.access_token}`, ...init?.headers }
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? `Request failed (${response.status})`);
  return payload;
}

function useBlogCollection(authorId: string, view: "public" | "cabinet", status: string, locale: AppLocale, active: boolean, revision: string, search = "", provider = "") {
  const [cache, setCache] = useState<Record<string, FeedPayload>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const inFlight = useRef(new Set<string>());
  const key = `${authorId}:${view}:${status}:${locale}:${search}:${provider}:${revision}`;
  const payload = cache[key];
  const load = useCallback(async (cursor?: string | null) => {
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    setPending((value) => ({ ...value, [key]: true }));
    setErrors((value) => ({ ...value, [key]: "" }));
    try {
      const params = new URLSearchParams({ scope: "blog", view, status, authorUserId: authorId, locale, limit: String(BLOG_PAGE_SIZE), ts: String(Date.now()) });
      if (search.trim()) params.set("search", search.trim());
      if (provider) params.set("provider", provider);
      if (cursor) params.set("cursor", cursor);
      const result = await request<FeedPayload>(`/api/social/feed?${params}`);
      setCache((current) => ({ ...current, [key]: { ...result, posts: mergeBlogPosts(cursor ? current[key]?.posts ?? [] : [], result.posts) } }));
    } catch (error) {
      setErrors((value) => ({ ...value, [key]: error instanceof Error ? error.message : String(error) }));
    } finally {
      inFlight.current.delete(key);
      setPending((value) => ({ ...value, [key]: false }));
    }
  }, [authorId, key, locale, provider, search, status, view]);
  useEffect(() => { if (active && !payload && !errors[key]) void load(); }, [active, errors, key, load, payload]);
  const update = (post: FeedPost, deleted = false) => setCache((current) => {
    const next = { ...current };
    for (const [cacheKey, entry] of Object.entries(next)) {
      if (!cacheKey.startsWith(`${authorId}:cabinet:`)) continue;
      const activeStatus = cacheKey.split(":")[2];
      const matches = !deleted && (activeStatus === "saved" ? post.post_type === "external_link" : activeStatus === post.status);
      next[cacheKey] = { ...entry, posts: mergeBlogPosts(entry.posts.filter((item) => item.id !== post.id), matches ? [post] : []) };
    }
    return next;
  });
  return { payload, error: errors[key], loading: Boolean(pending[key]), load, update };
}

type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

export function PublicBlog({ authorId, locale, active = true, revision = "", t, onOpenPost }: {
  authorId: string; locale: AppLocale; active?: boolean; revision?: string; t: Translate; onOpenPost: (post: FeedPost) => void;
}) {
  const { payload, loading, error, load } = useBlogCollection(authorId, "public", "published", locale, active, revision);
  const author = payload?.author;
  return <section className="blog-public" aria-label={t("social.blog.authorPosts")}>
    {payload ? <header className="blog-author-header">
      <div className="profile-avatar">{author?.avatar_url ? <img src={author.avatar_url} alt="" style={{ objectPosition: author.avatar_position ?? "50% 50%" }} /> : <span>{(author?.display_name ?? author?.username ?? "OA").slice(0, 2)}</span>}</div>
      <h2>{author?.display_name ?? author?.username ?? t("social.blog.authorFallback")}</h2>
      {payload.blogHeader?.bio ? <p>{payload.blogHeader.bio}</p> : null}
      <div className="blog-author-links">{payload.blogHeader?.links.map((link) => <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer">{link.label || link.url}</a>)}</div>
    </header> : null}
    {payload?.posts.length ? <FeedPostGallery fallbackTitle={t("social.post.detail")} posts={payload.posts} showAuthor={false} evidenceLabels={{ demo: t("social.feed.demoBadge"), verified: t("social.feed.verifiedBadge") }} onOpen={onOpenPost} /> : !loading && payload ? <p>{t("social.blog.empty")}</p> : null}
    <CollectionStatus loading={loading} error={error} more={Boolean(payload?.nextCursor)} t={t} onRetry={() => void load()} onMore={() => void load(payload?.nextCursor)} />
  </section>;
}

function CollectionStatus({ loading, error, more, t, onRetry, onMore }: { loading: boolean; error?: string; more: boolean; t: Translate; onRetry: () => void; onMore: () => void }) {
  return <div className="blog-collection-status" aria-live="polite">
    {error ? <div role="alert"><p className="finance-error">{error}</p><button type="button" className="secondary-button" disabled={loading} onClick={onRetry}>{t("social.blog.retry")}</button></div> : null}
    {loading ? <p>{t("app.common.loading")}</p> : null}
    {more ? <button type="button" className="secondary-button" disabled={loading} onClick={onMore}>{t("social.blog.showMore")}</button> : null}
  </div>;
}

type EditState = { post: FeedPost | null; sourceUrl: string; title: string; body: string; visibility: string; file: File | null; template: string | null; error: string; message: string };
const newEdit = (): EditState => ({ post: null, sourceUrl: "", title: "", body: "", visibility: "public", file: null, template: null, error: "", message: "" });
const templates = ["daily_progress", "level_up", "wish_completed", "challenge_completed"] as const;
const templateKeys = ["social.feed.cover.template.daily_progress", "social.feed.cover.template.level_up", "social.feed.cover.template.wish_completed", "social.feed.cover.template.challenge_completed"] as const;

export default function BlogWorkspace({ userId, authorId, locale, active, refreshKey, openCabinetNonce, t, onOpenPost, onChanged }: {
  userId: string; authorId: string | null; locale: AppLocale; active: boolean; refreshKey: string; openCabinetNonce: number;
  t: Translate; onOpenPost: (post: FeedPost) => void; onChanged: () => void;
}) {
  const ru = locale === "ru";
  const own = !authorId || authorId === userId;
  const [tab, setTab] = useState<"cabinet" | "posts">("cabinet");
  const [filter, setFilter] = useState("draft");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("");
  const scrollPositions = useRef<Record<string, number>>({});
  const positionKey = `${tab}:${filter}`;
  const selectTab = (next: "cabinet" | "posts") => { scrollPositions.current[positionKey] = window.scrollY; setTab(next); };
  const selectFilter = (next: string) => { scrollPositions.current[positionKey] = window.scrollY; setFilter(next); };
  useEffect(() => {
    if (active && own) window.scrollTo({ top: scrollPositions.current[positionKey] ?? 0, behavior: "instant" });
  }, [active, own, positionKey]);
  const [revision, setRevision] = useState(0);
  const collection = useBlogCollection(userId, "cabinet", filter, locale, active && own && tab === "cabinet", refreshKey, search, provider);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [editorKey, setEditorKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState("");
  const editor = editorKey ? edits[editorKey] : undefined;
  const startAddLink = (incoming?: { title?: unknown; text?: unknown; url?: unknown }) => {
    if (!SHARE_TO_OA_ENABLED) return;
    const selectedUrl = typeof incoming?.url === "string" ? incoming.url : "";
    const sharedText = typeof incoming?.text === "string" ? incoming.text.trim() : "";
    const bodyText = sharedText && sharedText !== selectedUrl ? sharedText.replace(selectedUrl, "").trim() : "";
    setTab("cabinet");
    setEdits((current) => ({ ...current, link: { ...newEdit(), sourceUrl: selectedUrl, title: typeof incoming?.title === "string" ? incoming.title.slice(0, 120) : "", body: bodyText, visibility: "private" } }));
    setLink(selectedUrl);
    setLinkError("");
    setEditorKey("link");
  };
  useEffect(() => {
    const onIncoming = (event: Event) => {
      const detail = (event as CustomEvent<{ title?: unknown; text?: unknown; url?: unknown }>).detail;
      if (detail) startAddLink(detail);
    };
    window.addEventListener("oa:share-target-draft", onIncoming);
    try {
      const stored = window.localStorage.getItem("oa.shareTargetDraft.v1");
      if (stored) {
        const draft = JSON.parse(stored) as { title?: unknown; text?: unknown; url?: unknown };
        if (typeof draft.url === "string" && draft.url.startsWith("http")) startAddLink(draft);
      }
    } catch { /* An unreadable incoming share remains on device for a later attempt. */ }
    return () => window.removeEventListener("oa:share-target-draft", onIncoming);
  }, []);
  useEffect(() => { if (openCabinetNonce) setTab("cabinet"); }, [openCabinetNonce]);
  const updateEdit = (change: Partial<EditState>) => {
    if (editorKey) setEdits((current) => ({ ...current, [editorKey]: { ...current[editorKey], ...change, message: "" } }));
  };
  const open = (post?: FeedPost) => {
    const key = (post ? Object.keys(edits).find((key) => edits[key].post?.id === post.id) : undefined) ?? post?.id ?? "new";
    setEdits((current) => current[key] ? current : { ...current, [key]: post ? {
      ...newEdit(), post, title: post.title ?? "", body: post.body ?? "", visibility: post.visibility,
      sourceUrl: post.externalLinks.find((item) => item.relation === "source")?.external_url ?? ""
    } : newEdit() });
    setEditorKey(key);
  };
  const openFile = (file: File | null) => {
    if (!file) return;
    setEdits((current) => ({
      ...current,
      new: { ...(current.new ?? newEdit()), file, template: null, error: "", message: "" }
    }));
    setEditorKey("new");
  };
  const changed = () => { setRevision((value) => value + 1); onChanged(); };
  async function save(publish: boolean) {
    if (!editor || !editorKey || busyRef.current) return;
    busyRef.current = true; setBusy(true); updateEdit({ error: "" });
    let working = { ...editor };
    const remember = () => setEdits((current) => ({ ...current, [editorKey]: working }));
    try {
      if (!working.post) {
        const result = editorKey === "link"
          ? await request<{ post: FeedPost; error?: string }>("/api/social/feed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: working.sourceUrl || link, title: working.title }) })
          : await request<{ post: FeedPost; error?: string }>("/api/social/feed/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: working.title, body: working.body, visibility: working.visibility }) });
        working = { ...working, post: result.post };
        remember(); collection.update(result.post); // Keep the id if a later upload fails.
      }
      let post = working.post!;
      const patch = async (action?: string) => {
        const result = await request<{ post: FeedPost; error?: string }>(`/api/social/feed/posts/${post.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, title: working.title, body: working.body, visibility: action === "publish" ? "public" : working.visibility, statBlocks: post.statBlocks.map((block) => ({ blockKey: block.block_key, visibility: block.visibility })) })
        });
        post = { ...post, ...result.post, statBlocks: post.statBlocks };
        working = { ...working, post }; remember(); collection.update(post);
      };
      await patch();
      if (post.post_type === "external_link" && post.externalLinks[0]?.metadata_status === "pending") {
        try {
          const previewResult = await request<{ preview: { title: string | null; description: string | null; authorName: string | null; thumbnailUrl: string | null; canonicalUrl: string | null; status: string } }>(`/api/social/feed/posts/${post.id}/preview`, { method: "POST" });
          const source = post.externalLinks[0];
          const preview = previewResult.preview;
          post = { ...post, externalLinks: [{ ...source, title: preview.title ?? source.title, description: preview.description, author_name: preview.authorName, thumbnail_url: preview.thumbnailUrl ? `/api/social/content/${post.id}/thumbnail` : null, canonical_url: preview.canonicalUrl, metadata_status: preview.status }, ...post.externalLinks.slice(1)] };
          working = { ...working, post }; remember(); collection.update(post);
        } catch { /* Saving the user's card must succeed even if the source is temporarily unavailable. */ }
      }
      if (working.file || working.template) {
        const form = new FormData();
        if (working.file) {
          form.set("file", working.file);
          if (working.file.type === "video/mp4") form.set("durationSeconds", String(await videoDuration(working.file)));
        }
        const result = await request<{ media: FeedMedia; error?: string }>(`/api/social/feed/posts/${post.id}/${post.post_type === "manual" || post.post_type === "external_link" ? "media" : "cover"}`, working.file
          ? { method: "POST", body: form }
          : { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateKey: working.template }) });
        post = { ...post, media: [result.media, ...post.media.filter((item) => item.sort_order !== 0)] };
        working = { ...working, post, file: null, template: null }; remember(); collection.update(post);
      }
      if (publish) await patch("publish");
      working = { ...working, error: "", message: t("social.blog.saved") }; remember();
      try {
        const pendingShare = window.localStorage.getItem("oa.shareTargetDraft.v1");
        if (pendingShare && working.sourceUrl && pendingShare.includes(working.sourceUrl)) window.localStorage.removeItem("oa.shareTargetDraft.v1");
      } catch { /* The server save has succeeded even if browser storage is unavailable. */ }
      // Move a newly created editor to its server id; reopening its tile keeps this state.
      setEdits((current) => { const next = { ...current, [post.id]: working }; if (editorKey !== post.id) delete next[editorKey]; return next; });
      setEditorKey(post.id);
      changed();
      if (publish) setEditorKey(null);
    } catch (error) {
      working = { ...working, error: error instanceof Error ? error.message : String(error), message: "" }; remember();
    } finally { busyRef.current = false; setBusy(false); }
  }
  async function deletePost() {
    if (!editor?.post || busyRef.current || !window.confirm(t("social.blog.deleteConfirm"))) return;
    busyRef.current = true; setBusy(true);
    try {
      await request(`/api/social/feed/posts/${editor.post.id}`, { method: "DELETE" });
      collection.update(editor.post, true); setEditorKey(null); changed();
      setEdits((current) => { const next = { ...current }; delete next[editorKey!]; return next; });
    } catch (error) { updateEdit({ error: error instanceof Error ? error.message : String(error) }); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function unpublish() {
    if (!editor?.post || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const result = await request<{ post: FeedPost }>(`/api/social/feed/posts/${editor.post.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "draft", visibility: "private", title: editor.title, body: editor.body })
      });
      const next = { ...editor, post: { ...editor.post, ...result.post }, visibility: "private", message: t("social.blog.saved") };
      setEdits((current) => ({ ...current, [editor.post!.id]: next }));
      collection.update(next.post); changed();
    } catch (error) { updateEdit({ error: error instanceof Error ? error.message : String(error) }); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const system = Boolean(editor?.post && ["daily_progress", "level_up", "wish_completed", "challenge"].includes(editor.post.post_type));
  const canChangeMedia = !editor?.post || editor.post.post_type === "external_link" || editor.post.status === "draft" && (system || editor.post.post_type === "manual");
  return <section className="blog-workspace" hidden={!active}>
    {own ? <div className="blog-workspace-tabs" role="tablist" aria-label={t("social.blog.mine")}>
      {(["cabinet", "posts"] as const).map((item, index) => <button key={item} id={`blog-tab-${item}`} aria-controls={`blog-panel-${item}`} role="tab" type="button" aria-selected={tab === item} tabIndex={tab === item ? 0 : -1} className={tab === item ? "active" : ""} onClick={() => selectTab(item)} onKeyDown={(event) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? "cabinet" : event.key === "End" ? "posts" : index ? "cabinet" : "posts"; selectTab(next); document.getElementById(`blog-tab-${next}`)?.focus(); }
      }}>{item === "cabinet" ? t("social.blog.cabinet") : t("social.blog.tab.posts")}</button>)}
    </div> : null}
    <div id="blog-panel-cabinet" role="tabpanel" aria-labelledby="blog-tab-cabinet" hidden={!own || tab !== "cabinet"}>
      <div className="blog-workspace-actions">
        <button type="button" className="primary-button" onClick={() => open()}>{t("social.blog.create")}</button>
        {SHARE_TO_OA_ENABLED ? <button type="button" className="secondary-button" onClick={() => startAddLink()}>{t("social.blog.addMaterial")}</button> : null}
      </div>
      <div className="blog-workspace-filters" aria-label={t("social.blog.materials")}>
        <button type="button" aria-pressed={filter === "draft"} onClick={() => selectFilter("draft")}>{t("social.blog.tab.drafts")}</button>
        <button type="button" aria-pressed={filter === "published"} onClick={() => selectFilter("published")}>{t("social.blog.published")}</button>
        <button type="button" aria-pressed={filter === "saved"} onClick={() => selectFilter("saved")}>{t("social.share.saved")}</button>
      </div>
      {filter === "saved" ? <form className="blog-workspace-filters" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); }}>
        <label>{t("social.share.search")}<input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label>
        <label>{t("social.share.sourceFilter")}<select value={provider} onChange={(event) => setProvider(event.target.value)}>
          <option value="">{t("social.share.sourceAll")}</option><option value="youtube">YouTube</option><option value="tiktok">TikTok</option><option value="instagram">Instagram</option><option value="telegram">Telegram</option><option value="x">X</option><option value="website">Website</option>
        </select></label>
        <button type="submit" className="secondary-button">{t("social.share.searchAction")}</button>
      </form> : null}
      <div className="blog-draft-gallery">{collection.payload?.posts.map((post) => {
        const title = getFeedPostTitle(post, t("social.blog.materialFallback"));
        const date = new Date(post.created_at).toLocaleDateString(ru ? "ru-RU" : "en-GB");
        const state = post.status === "draft" ? t("social.feed.draft") : t("social.blog.published");
        const visibility = post.visibility === "public" ? t("social.feed.public") : post.visibility === "private" ? t("social.blog.onlyMe") : post.visibility;
        const cover = getFeedPostCover(post);
        return <button key={post.id} type="button" className="blog-draft-tile" aria-label={`${title}, ${date}, ${state}, ${visibility}`} onClick={() => open(post)}>
          <span className="blog-draft-cover">{cover ? cover.startsWith("/api/social/content/") ? <ProtectedImage alt="" src={cover} /> : <img alt="" loading="lazy" src={cover} /> : <span>{title.slice(0, 80)}</span>}</span>
          <strong>{title}</strong><time dateTime={post.created_at}>{date}</time><span>{state}</span><span>{visibility}</span>
        </button>;
      })}</div>
      {!collection.loading && collection.payload && !collection.payload.posts.length ? <p>{t("social.blog.empty")}</p> : null}
      <CollectionStatus loading={collection.loading} error={collection.error} more={Boolean(collection.payload?.nextCursor)} t={t} onRetry={() => void collection.load()} onMore={() => void collection.load(collection.payload?.nextCursor)} />
    </div>
    <div id="blog-panel-posts" role={own ? "tabpanel" : undefined} aria-labelledby={own ? "blog-tab-posts" : undefined} hidden={own && tab !== "posts"}>
      <PublicBlog authorId={authorId ?? userId} locale={locale} active={active && (!own || tab === "posts")} revision={String(revision)} t={t} onOpenPost={onOpenPost} />
    </div>
    {active && own && editorKey ? <EditorDialog title={editorKey === "link" ? t("social.blog.addMaterialTitle") : t("social.blog.editorTitle")} closeLabel={t("app.common.close")} busy={busy} onClose={() => setEditorKey(null)}>
      {editor ? <form onSubmit={(event) => { event.preventDefault(); void save(false); }}>
        {editorKey === "link" ? <>
          <p>{t("social.blog.addMaterialHelp")}</p>
          <label>{t("social.blog.materialUrl")}<input type="url" required value={editor.sourceUrl || link} disabled={busy} onChange={(event) => { setLink(event.target.value); updateEdit({ sourceUrl: event.target.value }); }} /></label>
          {linkError ? <p className="finance-error" role="alert">{linkError}</p> : null}
        </> : null}
        {(editorKey === "link" || editor.post?.post_type === "external_link") ? <>
          <label>{t("social.post.detail")}<input type="text" maxLength={120} value={editor.title} disabled={busy} onChange={(event) => updateEdit({ title: event.target.value })} /></label>
          {editor.post?.externalLinks[0] ? <ExternalSourceCard link={editor.post.externalLinks[0]} postId={editor.post.id} t={t} /> : null}
          {editor.post?.post_type === "external_link" ? <>
            <ExternalShareActions postId={editor.post.id} t={t} />
            <ExternalWishActions postId={editor.post.id} title={editor.title || editor.post.externalLinks[0]?.title || ""} description={editor.body || editor.post.externalLinks[0]?.description || ""} t={t} />
            <button type="button" className="secondary-button" onClick={() => window.dispatchEvent(new CustomEvent("oa:open-ai-content", { detail: { contentPostId: editor.post!.id } }))}>{t("social.share.discussWithAi")}</button>
          </> : null}
        </> : null}
        <label>{t("social.blog.text")}<textarea rows={6} maxLength={editor.post?.post_type === "project_review" ? 1500 : 700} value={editor.body} disabled={busy} onChange={(event) => updateEdit({ body: event.target.value })} /></label>
        {editor.post ? <label>{t("social.blog.visibility")}<select value={editor.visibility} disabled={busy} onChange={(event) => updateEdit({ visibility: event.target.value })}>
          <option value="public">{t("social.blog.everyone")}</option><option value="private">{t("social.blog.onlyMe")}</option>
        </select></label> : null}
        {canChangeMedia ? <label>{t("social.blog.mediaCover")}<input type="file" disabled={busy} accept={system ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,video/mp4"} onChange={(event) => updateEdit({ file: event.target.files?.[0] ?? null, template: null })} /></label> : null}
        {editor.file ? <p>{editor.file.name}</p> : null}
        <p>{canChangeMedia ? t("social.blog.mediaHint") : null}</p>
        {system && canChangeMedia ? <fieldset disabled={busy}><legend>{t("social.blog.coverTemplate")}</legend><div className="blog-cover-options">{templates.map((key, index) => <button type="button" key={key} aria-pressed={editor.template === key} onClick={() => updateEdit({ template: key, file: null })}><img alt="" src={`/feed/system-events/${key.replaceAll("_", "-")}.png`} />{t(templateKeys[index])}</button>)}</div></fieldset> : null}
        {!editor.file && editor.post?.media[0]?.media_url ? editor.post.media[0].media_type === "video" ? <video className="blog-editor-preview" controls src={editor.post.media[0].media_url} /> : <img className="blog-editor-preview" alt="" src={editor.post.media[0].media_url} /> : null}
        {editor.post?.statBlocks.length ? <fieldset disabled={busy}><legend>{t("social.blog.publicBlocks")}</legend>{editor.post.statBlocks.map((block) => <label className="blog-block-option" key={block.id}><input type="checkbox" checked={block.visibility === "public"} onChange={(event) => updateEdit({ post: { ...editor.post!, statBlocks: editor.post!.statBlocks.map((item) => item.id === block.id ? { ...item, visibility: event.target.checked ? "public" : "private" } : item) } })} />{block.label}</label>)}</fieldset> : null}
        {editor.error ? <p role="alert" className="finance-error">{editor.error}</p> : null}
        {editor.message ? <p role="status">{editor.message}</p> : null}
        {editorKey === "link" ? <div className="blog-editor-actions">
          <button type="submit" className="secondary-button" disabled={busy || !editor.sourceUrl.trim()}>{t("social.share.saveForMe")}</button>
          <button type="button" className="primary-button" disabled={busy || !editor.sourceUrl.trim()} onClick={() => void save(true)}>{t("social.share.publish")}</button>
        </div> : null}
        <div className="blog-editor-actions"><button type="submit" className="secondary-button" disabled={busy || !editor.post && !editor.body.trim() && !editor.file}>{busy ? "…" : t("app.common.save")}</button>
          {editor.post?.status !== "published" ? <button type="button" className="primary-button" disabled={busy || !editor.post && !editor.body.trim() && !editor.file} onClick={() => void save(true)}>{t("social.feed.publish")}</button> : null}
          {editor.post ? <button type="button" className="text-button" disabled={busy} onClick={() => void deletePost()}>{t("app.common.delete")}</button> : null}</div>
        {editor.post?.post_type === "external_link" && editor.post.status === "published" ? <div className="blog-editor-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={() => void unpublish()}>{t("social.share.unpublish")}</button>
          <button type="button" className="text-button" onClick={() => { const source = editor.post!.externalLinks[0]?.external_url; const url = editor.post!.status === "published" ? `${window.location.origin}/p/${editor.post!.id}` : source; if (!url) return; if (navigator.share) void navigator.share({ title: editor.title, url }); else void navigator.clipboard.writeText(url); }}>{t("social.share.shareExternally")}</button>
        </div> : editor.post?.post_type === "external_link" ? <div className="blog-editor-actions">
          <button type="button" className="text-button" onClick={() => { const source = editor.post!.externalLinks[0]?.external_url; if (!source) return; if (navigator.share) void navigator.share({ title: editor.title, url: source }); else void navigator.clipboard.writeText(source); }}>{t("social.share.shareExternally")}</button>
        </div> : null}
      </form> : null}
    </EditorDialog> : null}
  </section>;
}

function ExternalSourceCard({ link, postId, t }: { link: FeedExternalLink; postId: string; t: Translate }) {
  const [source, setSource] = useState(link);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setSource(link), [link]);
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true); setError("");
    try {
      const result = await request<{ preview: { title: string | null; description: string | null; authorName: string | null; thumbnailUrl: string | null; canonicalUrl: string | null; status: FeedExternalLink["metadata_status"] } }>(`/api/social/feed/posts/${postId}/preview`, { method: "POST" });
      setSource((current) => ({ ...current, title: result.preview.title ?? current.title, description: result.preview.description, author_name: result.preview.authorName, canonical_url: result.preview.canonicalUrl, thumbnail_url: result.preview.thumbnailUrl ? `/api/social/content/${postId}/thumbnail` : null, metadata_status: result.preview.status ?? "failed" }));
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : String(requestError)); }
    finally { setRefreshing(false); }
  }
  return <article className="external-source-card">
    {source.thumbnail_url ? <ProtectedImage className="external-source-card-image" alt="" src={source.thumbnail_url.startsWith("/") ? source.thumbnail_url : `/api/social/content/${postId}/thumbnail`} /> : null}
    <div className="external-source-card-content"><strong>{source.title ?? source.provider}</strong>
      {source.author_name ? <p>{t("social.share.sourceBy", { name: source.author_name })}</p> : null}
      {source.description ? <p>{source.description}</p> : null}
      {!source.title && !source.description && !source.thumbnail_url ? <p>{t("social.share.noSourcePreview")}</p> : null}
      {error ? <p role="alert" className="finance-error">{error}</p> : null}
      <div className="external-source-card-actions">
        <a href={source.external_url} target="_blank" rel="noopener noreferrer">{t("social.share.sourceLink")}</a>
        <button type="button" className="text-button" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? "..." : t("social.share.refreshPreview")}</button>
      </div>
    </div>
  </article>;
}

type SharePerson = { user_id: string; username: string | null; display_name: string | null };

function ExternalShareActions({ postId, t }: { postId: string; t: Translate }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [people, setPeople] = useState<SharePerson[]>([]);
  const [recipients, setRecipients] = useState<SharePerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const idempotencyKey = useRef("");
  const idempotencyRecipient = useRef("");
  useEffect(() => {
    let cancelled = false;
    void request<{ recipients: SharePerson[] }>(`/api/social/content/${postId}/access`).then((result) => { if (!cancelled) setRecipients(result.recipients); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [postId]);
  useEffect(() => {
    if (!open || search.trim().length < 2) { setPeople([]); return; }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: search.trim(), limit: "10" });
      void request<{ people: Array<{ profile: SharePerson }> }>(`/api/social/people?${params}`).then((result) => {
        if (!cancelled) setPeople(result.people.map((person) => person.profile));
      }).catch((requestError) => { if (!cancelled) setError(requestError instanceof Error ? requestError.message : String(requestError)); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [open, search]);
  async function send(recipient: SharePerson) {
    if (loading) return;
    setLoading(true); setError(""); setNotice("");
    if (idempotencyRecipient.current !== recipient.user_id) {
      idempotencyKey.current = crypto.randomUUID();
      idempotencyRecipient.current = recipient.user_id;
    }
    try {
      await request(`/api/direct/conversations/${recipient.user_id}`, {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current },
        body: JSON.stringify({ contentPostId: postId })
      });
      idempotencyKey.current = "";
      idempotencyRecipient.current = "";
      setNotice(t("social.share.sent")); setRecipients((current) => current.some((row) => row.user_id === recipient.user_id) ? current : [recipient, ...current]);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : String(requestError)); }
    finally { setLoading(false); }
  }
  async function revoke(recipient: SharePerson) {
    setError("");
    try {
      await request(`/api/social/content/${postId}/access`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientUserId: recipient.user_id }) });
      setRecipients((current) => current.filter((row) => row.user_id !== recipient.user_id));
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : String(requestError)); }
  }
  return <section className="external-share-actions">
    <button type="button" className="secondary-button" aria-expanded={open} onClick={() => { setOpen((value) => !value); setNotice(""); }}>{t("social.share.sendToOa")}</button>
    {open ? <div className="external-recipient-picker">
      <label>{t("social.share.recipientSearch")}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      {people.map((person) => <button key={person.user_id} type="button" className="text-button" disabled={loading} onClick={() => void send(person)}>{person.display_name || person.username || person.user_id}</button>)}
      {recipients.length ? <div><strong>{t("social.share.recipients")}</strong>{recipients.map((person) => <div key={person.user_id}>
        <span>{person.display_name || person.username || person.user_id}</span><button type="button" className="text-button" onClick={() => void revoke(person)}>{t("social.share.revoke")}</button>
      </div>)}</div> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert" className="finance-error">{error}</p> : null}
    </div> : null}
  </section>;
}

type WishChoice = { id: string; title: string; description: string | null };

function ExternalWishActions({ postId, title, description, t }: { postId: string; title: string; description: string; t: Translate }) {
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [wishes, setWishes] = useState<WishChoice[]>([]);
  const [newTitle, setNewTitle] = useState(title);
  const [newDescription, setNewDescription] = useState(description);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const createIdempotencyKey = useRef("");
  useEffect(() => { setNewTitle(title); setNewDescription(description); }, [title, description]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void request<{ wishes: WishChoice[] }>("/api/wishes?status=active&includeRecommended=false")
      .then((result) => { if (!cancelled) setWishes(result.wishes); })
      .catch((requestError) => { if (!cancelled) setError(requestError instanceof Error ? requestError.message : String(requestError)); });
    return () => { cancelled = true; };
  }, [open]);
  async function attach(wishId?: string) {
    if (loading) return;
    setLoading(true); setError(""); setNotice("");
    try {
      if (!wishId && !createIdempotencyKey.current) createIdempotencyKey.current = crypto.randomUUID();
      await request("/api/wishes", { method: "POST", headers: { "Content-Type": "application/json", ...(wishId ? {} : { "Idempotency-Key": createIdempotencyKey.current }) }, body: JSON.stringify({ contentPostId: postId, wishId, title: newTitle, description: newDescription, targetAmount: null, visibility: "private" }) });
      if (!wishId) createIdempotencyKey.current = "";
      setNotice(t("social.share.attached")); setCreateOpen(false);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : String(requestError)); }
    finally { setLoading(false); }
  }
  return <section className="external-wish-actions">
    <button type="button" className="secondary-button" aria-expanded={open} onClick={() => { setOpen((value) => !value); setNotice(""); }}>{t("social.share.addToWish")}</button>
    {open ? <div className="external-wish-picker">
      <strong>{t("social.share.chooseWish")}</strong>
      {wishes.map((wish) => <button key={wish.id} type="button" className="text-button" disabled={loading} onClick={() => void attach(wish.id)}>{wish.title}</button>)}
      {!createOpen ? <button type="button" className="text-button" onClick={() => setCreateOpen(true)}>{t("social.share.newWish")}</button> : <>
        <label>{t("social.share.newWish")}<input maxLength={120} value={newTitle} onChange={(event) => setNewTitle(event.target.value)} /></label>
        <label>{t("social.blog.text")}<textarea rows={4} maxLength={1200} value={newDescription} onChange={(event) => setNewDescription(event.target.value)} /></label>
        <button type="button" className="primary-button" disabled={loading || !newTitle.trim()} onClick={() => void attach()}>{t("app.common.save")}</button>
      </>}
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert" className="finance-error">{error}</p> : null}
    </div> : null}
  </section>;
}

function EditorDialog({ title, closeLabel, busy, onClose, children }: { title: string; closeLabel: string; busy: boolean; onClose: () => void; children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const target = document.activeElement as HTMLElement | null;
    const y = window.scrollY;
    const overflow = document.body.style.overflow;
    dialog.current?.showModal(); document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; target?.focus({ preventScroll: true }); window.scrollTo({ top: y, behavior: "instant" }); };
  }, []);
  return createPortal(<dialog ref={dialog} className="blog-editor-dialog" aria-labelledby="blog-editor-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><h2 id="blog-editor-title">{title}</h2><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>{closeLabel}</button></header>{children}
  </dialog>, document.body);
}

function videoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const finish = (error?: string) => { clearTimeout(timer); URL.revokeObjectURL(url); video.removeAttribute("src"); video.load(); error ? reject(new Error(error)) : resolve(videoDurationValue); };
    let videoDurationValue = 0;
    const timer = setTimeout(() => finish("Could not read video duration."), 5000);
    video.preload = "metadata";
    video.onloadedmetadata = () => { videoDurationValue = video.duration; finish(!Number.isFinite(videoDurationValue) || videoDurationValue > 30 ? "Video must be 30 seconds or shorter." : undefined); };
    video.onerror = () => finish("Could not read video duration.");
    video.src = url;
  });
}
