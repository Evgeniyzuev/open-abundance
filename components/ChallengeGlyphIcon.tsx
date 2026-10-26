"use client";

import { BadgeCheck, Banknote, BookOpen, Bot, CalendarCheck, Coins, Compass, Crown, Dumbbell, Eye, Flag, Flame, FlaskConical, Footprints, Gift, Globe, Hand, HandHelping, Handshake, Heart, HeartHandshake, Hourglass, KeyRound, Link2, Map, Medal, Megaphone, MessageCircle, MessageSquareHeart, PartyPopper, PenLine, Puzzle, Repeat, Rocket, ScanSearch, Send, Sailboat, ShieldCheck, Ship, ShoppingBag, Smartphone, Sparkles, Sprout, Star, Store, Sun, SunDim, SunMedium, Sunrise, Target, TrendingUp, Trophy, UserCheck, UserPlus, Users, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// The icons named in lib/challengeArt.ts; every name there must be listed here (checked by test:challenge-art).
const ICONS: Record<string, LucideIcon> = { BadgeCheck, Banknote, BookOpen, Bot, CalendarCheck, Coins, Compass, Crown, Dumbbell, Eye, Flag, Flame, FlaskConical, Footprints, Gift, Globe, Hand, HandHelping, Handshake, Heart, HeartHandshake, Hourglass, KeyRound, Link2, Map, Medal, Megaphone, MessageCircle, MessageSquareHeart, PartyPopper, PenLine, Puzzle, Repeat, Rocket, ScanSearch, Send, Sailboat, ShieldCheck, Ship, ShoppingBag, Smartphone, Sparkles, Sprout, Star, Store, Sun, SunDim, SunMedium, Sunrise, Target, TrendingUp, Trophy, UserCheck, UserPlus, Users, UsersRound };

/** The drawn icon of a challenge cover (an SVG, so it looks the same on iPhone and Android, unlike emoji). */
export default function ChallengeGlyphIcon({ name }: { name: string }) {
  const Icon = ICONS[name];
  return Icon ? <Icon size={34} strokeWidth={2.1} aria-hidden="true" /> : null;
}
