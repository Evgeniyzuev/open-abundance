"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import FeedPostGallery, { getFeedPostCover, getFeedPostTitle } from "@/components/FeedPostGallery";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";
import { BLOG_PAGE_SIZE, mergeBlogPosts } from "@/lib/blogWorkspace";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import type { FeedMedia, FeedPayload, FeedPost } from "@/lib/socialFeed";

async function request<T extends { error?: string }>(url: string, init?: RequestInit): Promise<T> {
  const { data, error } = await getBrowserSupabaseClient().auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error("Please sign in again.");
  const response = await fetch(url, {
    ...init, cache: "no-store", signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${data.session.access_token}`, ...init?.headers }
  });
  const payload = await response.json() as T;
  if (!response.ok || payload.error) throw new Error(payload.error ?? `Request failed (${response.status})`);
  return payload;
}

function useBlogCollection(authorId: string, view: "public" | "cabinet", status: string, locale: AppLocale, active: boolean, revision: string) {
  const [cache, setCache] = useState<Record<string, FeedPayload>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const inFlight = useRef(new Set<string>());
  const key = `${authorId}:${view}:${status}:${locale}:${revision}`;
  const payload = cache[key];
  const load = useCallback(async (cursor?: string | null) => {
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    setPending((value) => ({ ...value, [key]: true }));
    setErrors((value) => ({ ...value, [key]: "" }));
    try {
      const params = new URLSearchParams({ scope: "blog", view, status, authorUserId: authorId, locale, limit: String(BLOG_PAGE_SIZE), ts: String(Date.now()) });
      if (cursor) params.set("cursor", cursor);
      const result = await request<FeedPayload>(`/api/social/feed?${params}`);
      setCache((current) => ({ ...current, [key]: { ...result, posts: mergeBlogPosts(cursor ? current[key]?.posts ?? [] : [], result.posts) } }));
    } catch (error) {
      setErrors((value) => ({ ...value, [key]: error instanceof Error ? error.message : String(error) }));
    } finally {
      inFlight.current.delete(key);
      setPending((value) => ({ ...value, [key]: false }));
    }
  }, [authorId, key, locale, status, view]);
  useEffect(() => { if (active && !payload && !errors[key]) void load(); }, [active, errors, key, load, payload]);
  const update = (post: FeedPost, deleted = false) => setCache((current) => {
    const next = { ...current };
    for (const [cacheKey, entry] of Object.entries(next)) {
      if (!cacheKey.startsWith(`${authorId}:cabinet:`)) continue;
      const matches = cacheKey.split(":")[2] === post.status && !deleted;
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
    {payload?.posts.length ? <FeedPostGallery fallbackTitle={t("social.post.detail")} posts={payload.posts} showAuthor={false} onOpen={onOpenPost} /> : !loading && payload ? <p>{t("social.blog.empty")}</p> : null}
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

type EditState = { post: FeedPost | null; body: string; visibility: string; file: File | null; template: string | null; error: string; message: string };
const newEdit = (): EditState => ({ post: null, body: "", visibility: "public", file: null, template: null, error: "", message: "" });
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
  const scrollPositions = useRef<Record<string, number>>({});
  const positionKey = `${tab}:${filter}`;
  const selectTab = (next: "cabinet" | "posts") => { scrollPositions.current[positionKey] = window.scrollY; setTab(next); };
  const selectFilter = (next: string) => { scrollPositions.current[positionKey] = window.scrollY; setFilter(next); };
  useEffect(() => {
    if (active && own) window.scrollTo({ top: scrollPositions.current[positionKey] ?? 0, behavior: "instant" });
  }, [active, own, positionKey]);
  const [revision, setRevision] = useState(0);
  const collection = useBlogCollection(userId, "cabinet", filter, locale, active && own && tab === "cabinet", refreshKey);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [editorKey, setEditorKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState("");
  const editor = editorKey ? edits[editorKey] : undefined;
  useEffect(() => { if (openCabinetNonce) setTab("cabinet"); }, [openCabinetNonce]);
  const updateEdit = (change: Partial<EditState>) => {
    if (editorKey) setEdits((current) => ({ ...current, [editorKey]: { ...current[editorKey], ...change, message: "" } }));
  };
  const open = (post?: FeedPost) => {
    const key = (post ? Object.keys(edits).find((key) => edits[key].post?.id === post.id) : undefined) ?? post?.id ?? "new";
    setEdits((current) => current[key] ? current : { ...current, [key]: post ? { ...newEdit(), post, body: post.body ?? "", visibility: post.visibility } : newEdit() });
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
        const result = await request<{ post: FeedPost; error?: string }>("/api/social/feed/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: working.body, visibility: working.visibility }) });
        working = { ...working, post: result.post };
        remember(); collection.update(result.post); // Keep the id if a later upload fails.
      }
      let post = working.post!;
      const patch = async (action?: string) => {
        const result = await request<{ post: FeedPost; error?: string }>(`/api/social/feed/posts/${post.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, body: working.body, visibility: working.visibility, statBlocks: post.statBlocks.map((block) => ({ blockKey: block.block_key, visibility: block.visibility })) })
        });
        post = { ...post, ...result.post, statBlocks: post.statBlocks };
        working = { ...working, post }; remember(); collection.update(post);
      };
      await patch();
      if (working.file || working.template) {
        const form = new FormData();
        if (working.file) {
          form.set("file", working.file);
          if (working.file.type === "video/mp4") form.set("durationSeconds", String(await videoDuration(working.file)));
        }
        const result = await request<{ media: FeedMedia; error?: string }>(`/api/social/feed/posts/${post.id}/${post.post_type === "manual" ? "media" : "cover"}`, working.file
          ? { method: "POST", body: form }
          : { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateKey: working.template }) });
        post = { ...post, media: [result.media, ...post.media.filter((item) => item.sort_order !== 0)] };
        working = { ...working, post, file: null, template: null }; remember(); collection.update(post);
      }
      if (publish) await patch("publish");
      working = { ...working, error: "", message: t("social.blog.saved") }; remember();
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
  async function publishLink() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setLinkError("");
    try {
      const result = await request<{ post: FeedPost; error?: string }>("/api/social/feed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: link }) });
      collection.update(result.post); setLink(""); setEditorKey(null); changed();
    } catch (error) { setLinkError(error instanceof Error ? error.message : String(error)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const system = Boolean(editor?.post && ["daily_progress", "level_up", "wish_completed", "challenge"].includes(editor.post.post_type));
  const canChangeMedia = !editor?.post || editor.post.status === "draft" && (system || editor.post.post_type === "manual");
  return <section className="blog-workspace" hidden={!active}>
    {own ? <div className="blog-workspace-tabs" role="tablist" aria-label={t("social.blog.mine")}>
      {(["cabinet", "posts"] as const).map((item, index) => <button key={item} id={`blog-tab-${item}`} aria-controls={`blog-panel-${item}`} role="tab" type="button" aria-selected={tab === item} tabIndex={tab === item ? 0 : -1} className={tab === item ? "active" : ""} onClick={() => selectTab(item)} onKeyDown={(event) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? "cabinet" : event.key === "End" ? "posts" : index ? "cabinet" : "posts"; selectTab(next); document.getElementById(`blog-tab-${next}`)?.focus(); }
      }}>{item === "cabinet" ? t("social.blog.cabinet") : t("social.blog.tab.posts")}</button>)}
    </div> : null}
    <div id="blog-panel-cabinet" role="tabpanel" aria-labelledby="blog-tab-cabinet" hidden={!own || tab !== "cabinet"}>
      <div className="blog-workspace-actions">
        <button type="button" className="primary-button" onClick={() => open()}>{t("social.blog.create")}</button>
        <button type="button" className="secondary-button" onClick={() => setEditorKey("link")}>{t("social.blog.addMaterial")}</button>
      </div>
      <div className="blog-workspace-filters" aria-label={t("social.blog.materials")}>
        <button type="button" aria-pressed={filter === "draft"} onClick={() => selectFilter("draft")}>{t("social.blog.tab.drafts")}</button>
        <button type="button" aria-pressed={filter === "published"} onClick={() => selectFilter("published")}>{t("social.blog.published")}</button>
      </div>
      <div className="blog-draft-gallery">{collection.payload?.posts.map((post) => {
        const title = getFeedPostTitle(post, t("social.blog.materialFallback"));
        const date = new Date(post.created_at).toLocaleDateString(ru ? "ru-RU" : "en-GB");
        const state = post.status === "draft" ? t("social.feed.draft") : t("social.blog.published");
        const visibility = post.visibility === "public" ? t("social.feed.public") : post.visibility === "private" ? t("social.blog.onlyMe") : post.visibility;
        const cover = getFeedPostCover(post);
        return <button key={post.id} type="button" className="blog-draft-tile" aria-label={`${title}, ${date}, ${state}, ${visibility}`} onClick={() => open(post)}>
          <span className="blog-draft-cover">{cover ? <img alt="" loading="lazy" src={cover} /> : <span>{title.slice(0, 80)}</span>}</span>
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
      {editorKey === "link" ? <form onSubmit={(event) => { event.preventDefault(); void publishLink(); }}>
        <p>{t("social.blog.addMaterialHelp")}</p>
        <label className="secondary-button blog-material-file">
          <span>{t("social.blog.chooseFile")}</span>
          <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,video/mp4" disabled={busy} onChange={(event) => {
            openFile(event.target.files?.[0] ?? null);
            event.currentTarget.value = "";
          }} />
        </label>
        <span className="blog-material-divider">{t("social.blog.or")}</span>
        <label>{t("social.blog.materialUrl")}<input type="url" required value={link} disabled={busy} onChange={(event) => setLink(event.target.value)} /></label>
        {linkError ? <p className="finance-error" role="alert">{linkError}</p> : null}
        <button className="primary-button" type="submit" disabled={busy || !link.trim()}>{t("social.blog.publishLink")}</button>
      </form> : editor ? <form onSubmit={(event) => { event.preventDefault(); void save(false); }}>
        <label>{t("social.blog.text")}<textarea rows={6} maxLength={editor.post?.post_type === "project_review" ? 1500 : 700} value={editor.body} disabled={busy} onChange={(event) => updateEdit({ body: event.target.value })} /></label>
        <label>{t("social.blog.visibility")}<select value={editor.visibility} disabled={busy} onChange={(event) => updateEdit({ visibility: event.target.value })}>
          <option value="public">{t("social.blog.everyone")}</option><option value="private">{t("social.blog.onlyMe")}</option>
          {editor.post && editor.post.post_type !== "manual" ? <><option value="followers">{t("profile.visibility.followers")}</option><option value="team">{t("profile.visibility.team")}</option><option value="contacts">{t("profile.visibility.contacts")}</option></> : null}
        </select></label>
        {canChangeMedia ? <label>{t("social.blog.mediaCover")}<input type="file" disabled={busy} accept={system ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,video/mp4"} onChange={(event) => updateEdit({ file: event.target.files?.[0] ?? null, template: null })} /></label> : null}
        {editor.file ? <p>{editor.file.name}</p> : null}
        <p>{canChangeMedia ? t("social.blog.mediaHint") : null}</p>
        {system && canChangeMedia ? <fieldset disabled={busy}><legend>{t("social.blog.coverTemplate")}</legend><div className="blog-cover-options">{templates.map((key, index) => <button type="button" key={key} aria-pressed={editor.template === key} onClick={() => updateEdit({ template: key, file: null })}><img alt="" src={`/feed/system-events/${key.replaceAll("_", "-")}.png`} />{t(templateKeys[index])}</button>)}</div></fieldset> : null}
        {!editor.file && editor.post?.media[0]?.media_url ? editor.post.media[0].media_type === "video" ? <video className="blog-editor-preview" controls src={editor.post.media[0].media_url} /> : <img className="blog-editor-preview" alt="" src={editor.post.media[0].media_url} /> : null}
        {editor.post?.statBlocks.length ? <fieldset disabled={busy}><legend>{t("social.blog.publicBlocks")}</legend>{editor.post.statBlocks.map((block) => <label className="blog-block-option" key={block.id}><input type="checkbox" checked={block.visibility === "public"} onChange={(event) => updateEdit({ post: { ...editor.post!, statBlocks: editor.post!.statBlocks.map((item) => item.id === block.id ? { ...item, visibility: event.target.checked ? "public" : "private" } : item) } })} />{block.label}</label>)}</fieldset> : null}
        {editor.error ? <p role="alert" className="finance-error">{editor.error}</p> : null}
        {editor.message ? <p role="status">{editor.message}</p> : null}
        <div className="blog-editor-actions"><button type="submit" className="secondary-button" disabled={busy || !editor.post && !editor.body.trim() && !editor.file}>{busy ? "…" : t("app.common.save")}</button>
          {editor.post?.status !== "published" ? <button type="button" className="primary-button" disabled={busy || !editor.post && !editor.body.trim() && !editor.file} onClick={() => void save(true)}>{t("social.feed.publish")}</button> : null}
          {editor.post ? <button type="button" className="text-button" disabled={busy} onClick={() => void deletePost()}>{t("app.common.delete")}</button> : null}</div>
      </form> : null}
    </EditorDialog> : null}
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
