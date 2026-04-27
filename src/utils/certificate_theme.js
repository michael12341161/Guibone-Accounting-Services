const THEME_DEFINITIONS = [
  {
    value: "none",
    label: "None",
    description: "Use the original plain certificate colors.",
    hasDecorations: false,
    sheetBackground: "#ffffff",
    outerBorder: "#e2e8f0",
    innerBorder: "transparent",
    accentStart: "transparent",
    accentEnd: "transparent",
    sealBorder: "transparent",
    sealGlow: "transparent",
    footerRule: "transparent",
    logoBorder: "#e2e8f0",
    logoBackground: "#ffffff",
    logoShadow: "rgba(15, 23, 42, 0.08)",
    shadow: "0 28px 70px rgba(15, 23, 42, 0.16)",
    badgeBackground: "rgba(148, 163, 184, 0.12)",
    badgeBorder: "rgba(148, 163, 184, 0.22)",
    badgeText: "#475569",
  },
  {
    value: "classic",
    label: "Classic",
    description: "Warm ivory paper with gold framing.",
    hasDecorations: true,
    sheetBackground: "linear-gradient(180deg, #fffdf7 0%, #fff7ea 100%)",
    outerBorder: "rgba(180, 138, 62, 0.44)",
    innerBorder: "rgba(180, 138, 62, 0.24)",
    accentStart: "rgba(180, 138, 62, 0.22)",
    accentEnd: "rgba(244, 200, 94, 0.12)",
    sealBorder: "rgba(180, 138, 62, 0.18)",
    sealGlow: "rgba(244, 200, 94, 0.2)",
    footerRule: "rgba(180, 138, 62, 0.46)",
    logoBorder: "rgba(180, 138, 62, 0.28)",
    logoBackground: "rgba(255, 255, 255, 0.94)",
    logoShadow: "rgba(120, 85, 24, 0.12)",
    shadow: "0 28px 70px rgba(90, 62, 16, 0.12)",
    badgeBackground: "rgba(180, 138, 62, 0.12)",
    badgeBorder: "rgba(180, 138, 62, 0.2)",
    badgeText: "#8a5a0a",
  },
  {
    value: "royal",
    label: "Royal Blue",
    description: "Crisp blue accents with a formal finish.",
    hasDecorations: true,
    sheetBackground: "linear-gradient(180deg, #fbfdff 0%, #edf4ff 100%)",
    outerBorder: "rgba(37, 99, 235, 0.4)",
    innerBorder: "rgba(37, 99, 235, 0.2)",
    accentStart: "rgba(37, 99, 235, 0.24)",
    accentEnd: "rgba(147, 197, 253, 0.14)",
    sealBorder: "rgba(37, 99, 235, 0.16)",
    sealGlow: "rgba(96, 165, 250, 0.18)",
    footerRule: "rgba(37, 99, 235, 0.42)",
    logoBorder: "rgba(37, 99, 235, 0.24)",
    logoBackground: "rgba(255, 255, 255, 0.95)",
    logoShadow: "rgba(37, 99, 235, 0.12)",
    shadow: "0 28px 70px rgba(30, 64, 175, 0.12)",
    badgeBackground: "rgba(37, 99, 235, 0.1)",
    badgeBorder: "rgba(37, 99, 235, 0.18)",
    badgeText: "#1d4ed8",
  },
  {
    value: "emerald",
    label: "Emerald",
    description: "Fresh green trim with a premium paper tone.",
    hasDecorations: true,
    sheetBackground: "linear-gradient(180deg, #fbfefb 0%, #eefcf4 100%)",
    outerBorder: "rgba(5, 150, 105, 0.4)",
    innerBorder: "rgba(5, 150, 105, 0.2)",
    accentStart: "rgba(5, 150, 105, 0.2)",
    accentEnd: "rgba(110, 231, 183, 0.14)",
    sealBorder: "rgba(5, 150, 105, 0.16)",
    sealGlow: "rgba(52, 211, 153, 0.18)",
    footerRule: "rgba(5, 150, 105, 0.42)",
    logoBorder: "rgba(5, 150, 105, 0.24)",
    logoBackground: "rgba(255, 255, 255, 0.95)",
    logoShadow: "rgba(5, 150, 105, 0.12)",
    shadow: "0 28px 70px rgba(6, 95, 70, 0.12)",
    badgeBackground: "rgba(5, 150, 105, 0.1)",
    badgeBorder: "rgba(5, 150, 105, 0.18)",
    badgeText: "#047857",
  },
  {
    value: "rose",
    label: "Rose",
    description: "Soft blush paper with rich burgundy accents.",
    hasDecorations: true,
    sheetBackground: "linear-gradient(180deg, #fffdfd 0%, #fff1f3 100%)",
    outerBorder: "rgba(190, 24, 93, 0.32)",
    innerBorder: "rgba(190, 24, 93, 0.16)",
    accentStart: "rgba(190, 24, 93, 0.18)",
    accentEnd: "rgba(253, 164, 175, 0.14)",
    sealBorder: "rgba(190, 24, 93, 0.14)",
    sealGlow: "rgba(244, 114, 182, 0.16)",
    footerRule: "rgba(190, 24, 93, 0.36)",
    logoBorder: "rgba(190, 24, 93, 0.2)",
    logoBackground: "rgba(255, 255, 255, 0.95)",
    logoShadow: "rgba(157, 23, 77, 0.1)",
    shadow: "0 28px 70px rgba(136, 19, 55, 0.1)",
    badgeBackground: "rgba(190, 24, 93, 0.08)",
    badgeBorder: "rgba(190, 24, 93, 0.14)",
    badgeText: "#be185d",
  },
];

const THEME_MAP = THEME_DEFINITIONS.reduce((accumulator, theme) => {
  accumulator[theme.value] = theme;
  return accumulator;
}, {});

export const DEFAULT_CERTIFICATE_THEME_KEY = THEME_DEFINITIONS[0].value;
export const CERTIFICATE_THEME_OPTIONS = THEME_DEFINITIONS.map(({ value, label, description }) => ({
  value,
  label,
  description,
}));

export function getCertificateThemeConfig(themeKey = DEFAULT_CERTIFICATE_THEME_KEY) {
  return THEME_MAP[themeKey] || THEME_MAP[DEFAULT_CERTIFICATE_THEME_KEY];
}

export function shouldRenderCertificateThemeLayers(themeKey) {
  return Boolean(getCertificateThemeConfig(themeKey).hasDecorations);
}

export function getCertificateThemeShellStyle(themeKey) {
  const theme = getCertificateThemeConfig(themeKey);

  return {
    background: theme.sheetBackground,
    border: `1px solid ${theme.outerBorder}`,
    boxShadow: theme.shadow,
  };
}

export function getCertificateThemeOuterFrameStyle(themeKey) {
  const theme = getCertificateThemeConfig(themeKey);

  return {
    left: "18px",
    right: "18px",
    top: "18px",
    bottom: "18px",
    border: `2px solid ${theme.outerBorder}`,
    borderRadius: "28px",
  };
}

export function getCertificateThemeInnerFrameStyle(themeKey) {
  const theme = getCertificateThemeConfig(themeKey);

  return {
    left: "34px",
    right: "34px",
    top: "34px",
    bottom: "34px",
    border: `1px solid ${theme.innerBorder}`,
    borderRadius: "22px",
  };
}

export function getCertificateThemeAccentBandStyle(themeKey) {
  const theme = getCertificateThemeConfig(themeKey);

  return {
    left: "56px",
    right: "56px",
    top: "42px",
    height: "112px",
    borderRadius: "34px 34px 56px 56px",
    background: `linear-gradient(135deg, ${theme.accentStart} 0%, ${theme.accentEnd} 100%)`,
  };
}

export function getCertificateThemeSealStyle(themeKey) {
  const theme = getCertificateThemeConfig(themeKey);

  return {
    left: "50%",
    top: "84px",
    width: "170px",
    height: "170px",
    transform: "translateX(-50%)",
    borderRadius: "999px",
    border: `1px solid ${theme.sealBorder}`,
    background: `radial-gradient(circle at 50% 50%, ${theme.sealGlow} 0%, rgba(255, 255, 255, 0) 68%)`,
  };
}

export function getCertificateThemeFooterRuleStyle(themeKey) {
  const theme = getCertificateThemeConfig(themeKey);

  return {
    left: "72px",
    right: "72px",
    bottom: "64px",
    height: "1px",
    background: `linear-gradient(90deg, transparent 0%, ${theme.footerRule} 50%, transparent 100%)`,
  };
}

export function getCertificateThemeLogoStyle(themeKey) {
  return {
    border: "1px solid rgba(15, 23, 42, 0.32)",
    background: "transparent",
    boxShadow: "none",
  };
}

export function getCertificateThemeBadgeStyle(themeKey) {
  const theme = getCertificateThemeConfig(themeKey);

  return {
    background: theme.badgeBackground,
    borderColor: theme.badgeBorder,
    color: theme.badgeText,
  };
}
