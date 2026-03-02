export const BRAND = {
  name: "CB",
  tagline: "We're All In",
  brandIdea: "Cloud and Proud",
  vision: "To change the way the world bets and thinks about online betting.",

  colors: {
    primary: {
      orange: "#FF6B2F",
      purple: "#8D52DA",
      green: "#4B7C39",
      blue: "#2D4BE6",
      yellow: "#DFFD51",
    },
    light: {
      orange: "#FF9A59",
      purple: "#CCA6FF",
      green: "#9BCA75",
      blue: "#99AAFF",
      yellow: "#DDFF99",
    },
    dark: {
      orange: "#4D2E27",
      purple: "#300931",
      green: "#283329",
      blue: "#0F1032",
      yellow: "#94B300",
    },
    pale: {
      orange: "#FFF6EC",
      purple: "#EDE0FF",
      green: "#D8F3B5",
      blue: "#CCD0E5",
      yellow: "#FEFFD9",
    },
    neutral: {
      black: "#000000",
      white: "#FFFFFF",
    },
    uiGrey: {
      grey1: "#141114",
      grey2: "#2D202D",
      grey3: "#6F586F",
      grey4: "#AD99AD",
      grey5: "#EAE3EA",
      grey6: "#1A1C1E",
      grey7: "#23272D",
    },
    launchPrimaries: ["#FF6B2F", "#8D52DA", "#DFFD51", "#300931"],
  },

  typography: {
    primary: {
      family: "Midnight Sans ST",
      weights: ["48 Heavy"],
      usage: "Headlines and hero text",
      style: "ALL CAPS",
      leading: "110%",
      tracking: "Optical",
      fontFiles: [
        "midnight-sans-st-48-heavy-pro.woff2",
        "midnight-sans-st-48-heavy-pro.ttf",
        "midnight-sans-st-24-heavy-pro.woff2",
      ],
    },
    secondary: {
      family: "Inter",
      weights: ["Light", "Regular", "Medium", "Semi Bold", "Bold", "Extra Bold"],
      usage: "Body copy, subheads, UI, small print",
      style: "Sentence case",
      leading: "120-140%",
      tracking: "Metric/Default",
      fontFiles: ["Inter-Regular.ttf", "Inter-Regular.woff2"],
    },
  },

  toneOfVoice: {
    principles: [
      {
        name: "Inspire with Optimism",
        description:
          "From connecting with a community to unlocking a new level of crypto wealth, anything can happen on CB. Relentlessly upbeat and optimistic voice that celebrates possibilities.",
      },
      {
        name: "Add Some Energy",
        description:
          "The life-changing joy of a jackpot. The drama of a dice roll. The tension of a tie-break. Infuse the energy and anticipation of online betting into all language.",
      },
      {
        name: "Keep It Credible",
        description:
          "Never get too wild or outrageous. Keep things credible with smart, sophisticated and grown-up language. We are the safest and most reliable place to bet with crypto.",
      },
      {
        name: "Welcome Everyone",
        description:
          "Write like the experts we are — able to talk the talk with experienced bettors, but also able to educate and welcome novices. Friendly, playful, community and trust focused.",
      },
    ],
    themes: [
      "Trust",
      "Community",
      "Entertainment",
      "Legacy",
      "Crypto Advantage",
      "Inclusivity",
      "Highest Betting Limits",
    ],
  },

  messaging: {
    trust: "The safest place to place your bets with crypto.",
    community: "Come for the bets. Stay for the community. Welcome to CB.",
    entertainment: "Imagine if your favorite group chat did gambling.",
    legacy: "10 years of crypto betting community. And we're only just getting started.",
    cryptoAdvantage: "Our money's on crypto. Yours should be too. Higher betting limits. Faster withdrawals.",
    inclusive: "Where all bets are on. And all bets are welcome.",
    highRollers: "Big bettors deserve better.",
    manifesto:
      "We are all in. All the time. Whatever the level we're playing. From $5 to 7 figures and beyond. CB is a community made for players, by players.",
  },

  brandBehaviors: [
    "For Players, By Players",
    "Proudly Crypto",
    "Home of the High Rollers",
    "Inclusive of Everyone",
  ],
} as const;

export type BrandColors = typeof BRAND.colors;
export type BrandTypography = typeof BRAND.typography;
export type BrandTOV = typeof BRAND.toneOfVoice;

export function getBrandColorList(): { name: string; hex: string }[] {
  const list: { name: string; hex: string }[] = [];
  for (const [group, colors] of Object.entries(BRAND.colors)) {
    if (group === "launchPrimaries") continue;
    for (const [name, hex] of Object.entries(colors)) {
      list.push({ name: `${group}.${name}`, hex: hex as string });
    }
  }
  return list;
}

export function getBrandColorHexValues(): string[] {
  return getBrandColorList().map((c) => c.hex);
}
