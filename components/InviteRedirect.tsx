"use client";

import { useEffect } from "react";

/** Sends a person from the invitation page on to the app; link-preview bots don't run scripts and stay on the page. */
export default function InviteRedirect({ href }: { href: string }) {
  useEffect(() => {
    window.location.replace(href);
  }, [href]);
  return null;
}
