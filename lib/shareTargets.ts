export type ShareTarget = { key: string; label: string; href: string };

/** Web share links that open each network's own composer with the text and link prefilled. */
export function shareTargets(url: string, text: string): ShareTarget[] {
  const u = encodeURIComponent(url);
  const tx = encodeURIComponent(text);
  const both = encodeURIComponent(`${text} ${url}`);
  return [
    { key: "telegram", label: "Telegram", href: `https://t.me/share/url?url=${u}&text=${tx}` },
    { key: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${both}` },
    { key: "x", label: "X", href: `https://twitter.com/intent/tweet?text=${tx}&url=${u}` },
    { key: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { key: "linkedin", label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { key: "vk", label: "VK", href: `https://vk.com/share.php?url=${u}&title=${tx}` }
  ];
}
