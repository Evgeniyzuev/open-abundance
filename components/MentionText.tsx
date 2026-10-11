import { splitMentions } from "@/lib/mentions";

/** Plain text in which `@nickname` becomes a link to that person's profile (`/@nickname`). */
export default function MentionText({ text }: { text: string }) {
  return (
    <>
      {splitMentions(text).map((part, index) => part.mention
        ? <a className="mention-link" href={`/@${part.mention}`} key={index}>{part.text}</a>
        : <span key={index}>{part.text}</span>)}
    </>
  );
}
