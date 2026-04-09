import React from "react";
import {
  getCertificateThemeAccentBandStyle,
  getCertificateThemeConfig,
  getCertificateThemeFooterRuleStyle,
  getCertificateThemeInnerFrameStyle,
  getCertificateThemeOuterFrameStyle,
  getCertificateThemeSealStyle,
} from "../../utils/certificate_theme";

export default function CertificateThemeLayers({ themeKey }) {
  const themeConfig = getCertificateThemeConfig(themeKey);

  if (!themeConfig.hasDecorations) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
      <div className="absolute" style={getCertificateThemeOuterFrameStyle(themeKey)} />
      <div className="absolute" style={getCertificateThemeInnerFrameStyle(themeKey)} />
      <div className="absolute" style={getCertificateThemeAccentBandStyle(themeKey)} />
      <div className="absolute" style={getCertificateThemeSealStyle(themeKey)} />
      <div className="absolute" style={getCertificateThemeFooterRuleStyle(themeKey)} />
    </div>
  );
}
