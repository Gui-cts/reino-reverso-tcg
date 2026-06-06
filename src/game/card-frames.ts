/** Molduras de carta (PNG em public/cards/frames/). */
export const CARD_FRAME_URLS = {
  essence: "/cards/frames/frame-essencia.png",
  corruption: "/cards/frames/frame-corrupcao.png",
  essenceAndCorruption: "/cards/frames/frame-essencia-corrupcao.png",
} as const;

export type CardFrameKind = keyof typeof CARD_FRAME_URLS;
