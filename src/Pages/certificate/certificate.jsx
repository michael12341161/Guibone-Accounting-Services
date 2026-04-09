import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { Button, IconButton } from "../../components/UI/buttons";
import { Card, CardContent, CardHeader } from "../../components/UI/card";
import CertificateThemeLayers from "../../components/certificate/CertificateThemeLayers";
import { useModulePermissions } from "../../context/ModulePermissionsContext";
import { useAuth } from "../../hooks/useAuth";
import { showErrorToast, showSuccessToast } from "../../utils/feedback";
import {
  DEFAULT_CERTIFICATE_THEME_KEY,
  getCertificateThemeBadgeStyle,
  getCertificateThemeConfig,
  getCertificateThemeLogoStyle,
  getCertificateThemeShellStyle,
} from "../../utils/certificate_theme";
import { hasFeatureActionAccess, hasModuleAccess } from "../../utils/module_permissions";
import {
  deleteCertificateTemplate as deleteCertificateTemplateRequest,
  fetchCertificateTemplates,
  saveSelectedCertificateTemplates,
} from "../../services/api";

const SERVICE_OPTIONS = [
  { value: "tax_filing", label: "Tax Filing" },
  { value: "bookkeeping", label: "Bookkeeping" },
  { value: "auditing", label: "Auditing" },
];
const DEFAULT_SERVICE_KEY = SERVICE_OPTIONS[0].value;
const MAX_SELECTED_TEMPLATES = 3;
const SERVICE_LAYOUT_PRESETS = {
  tax_filing: {
    pageSize: "A4",
    fontFamily: "arial",
  },
};
const LEGACY_DEFAULT_CONTENT_TEXT =
  "This certifies that [Client Name] has successfully completed the requested service with Guibone Accounting Services.";
const LEGACY_DEFAULT_SIGNATURE_LABEL = "Authorized Signature";
const CERTIFICATE_GUIDE_TITLE_TEXT = "CERTIFICATE OF SERVICE COMPLETION";
const LEGACY_GUIDE_BODY_TEXT =
  "This is to certify that\n[Client Name]\n\nhas successfully completed the [Service Type]\nprovided by [Company Name].\n\nThe service covered the period from [Start Date] to [End Date],\nand has been completed in accordance with professional accounting standards.\n\nThis certificate is issued as proof that the required service has been duly completed.\n\nIssued this [Date]\n\n[Accountant Name]\nAuthorized Accountant\n\n[Company Name]\n\nCertificate ID: [Certificate ID]";
const LEGACY_GUIDE_BODY_WITH_SIGNATURE_TEXT =
  "This is to certify that\n\n[CLIENT NAME]\n\nhas successfully completed the [SERVICE TYPE]\nprovided by [COMPANY NAME].\n\nThe service covered the period from [START DATE] to [END DATE],\nand has been completed in accordance with professional accounting standards.\n\nThis certificate is issued as proof that the required service has been duly completed.\n\nIssued this [DATE]\n\n[AUTHORIZED SIGNATORY NAME]\nAuthorized Representative\n\n[COMPANY NAME]\n\nCertificate ID: [CERTIFICATE ID]";
const LEGACY_GUIDE_BODY_WITH_CERTIFICATE_ID_TEXT =
  "This is to certify that\n\n[CLIENT NAME]\n\nhas successfully completed the [SERVICE TYPE]\nprovided by [COMPANY NAME].\n\nThe service covered the period from [START DATE] to [END DATE],\nand has been completed in accordance with professional accounting standards.\n\nThis certificate is issued as proof that the required service has been duly completed.\n\nIssued this [DATE]\n\n[COMPANY NAME]\n\nCertificate ID: [CERTIFICATE ID]";
const CERTIFICATE_GUIDE_BODY_TEXT =
  "This is to certify that\n\n[CLIENT NAME]\n\nhas successfully completed the [SERVICE TYPE]\nprovided by [COMPANY NAME].\n\nThe service covered the period from [START DATE] to [END DATE],\nand has been completed in accordance with professional accounting standards.\n\nThis certificate is issued as proof that the required service has been duly completed.\n\nIssued this [DATE]\n\n[COMPANY NAME]";
const CERTIFICATE_GUIDE_FOOTER_TEXT = "Certificate ID: [CERTIFICATE ID]";
const CERTIFICATE_GUIDE_SIGNATURE_LABEL = "[AUTHORIZED SIGNATORY NAME]\nAuthorized Representative";
const LEGACY_GUIDE_SIGNATURE_LABEL = "Signature [Admin Name]";
const LEGACY_GUIDE_SIGNATURE_LABEL_WITH_COLON = "Signature: [Admin Name]";
const PAGE_SIZE_OPTIONS = [
  { value: "A4", label: "A4", width: 794, height: 1123 },
  { value: "LETTER", label: "Letter", width: 816, height: 1056 },
  { value: "LEGAL", label: "Legal", width: 816, height: 1344 },
];
const FONT_OPTIONS = [
  { value: "arial", label: "Arial", family: "Arial, sans-serif" },
  { value: "georgia", label: "Georgia", family: "Georgia, serif" },
  { value: "times", label: "Times New Roman", family: "\"Times New Roman\", serif" },
  { value: "verdana", label: "Verdana", family: "Verdana, sans-serif" },
  { value: "trebuchet", label: "Trebuchet MS", family: "\"Trebuchet MS\", sans-serif" },
  { value: "courier", label: "Courier New", family: "\"Courier New\", monospace" },
];
const PREVIEW_TARGET_WIDTH = 300;
const PREVIEW_NAVIGATION_THRESHOLD = 3;

function getCertificateWorkspaceBasePath(pathname) {
  return String(pathname || "").startsWith("/secretary") ? "/secretary" : "/admin";
}

function getPageConfig(pageSize = "A4") {
  return PAGE_SIZE_OPTIONS.find((option) => option.value === pageSize) || PAGE_SIZE_OPTIONS[0];
}

function getFontConfig(fontKey = "arial") {
  return FONT_OPTIONS.find((option) => option.value === fontKey) || FONT_OPTIONS[0];
}

function getSignatureLabelParts(label) {
  const normalized = String(label || "").trim();

  if (!normalized) {
    return { topText: "", bottomText: "" };
  }

  const lines = normalized
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length >= 2) {
    return {
      topText: lines[0],
      bottomText: lines.slice(1).join("\n"),
    };
  }

  const match = normalized.match(/^(.*?):\s*(.+)$/);
  if (match) {
    return {
      topText: match[2].trim(),
      bottomText: match[1].trim(),
    };
  }

  const signatureMatch = normalized.match(/^(signature)\s+(.+)$/i);
  if (signatureMatch) {
    return {
      topText: signatureMatch[2].trim(),
      bottomText: signatureMatch[1].trim(),
    };
  }

  if (/signature/i.test(normalized)) {
    return { topText: "", bottomText: normalized };
  }

  return { topText: normalized, bottomText: "" };
}

function getSignatureTopOffset(block, topText) {
  if (!String(topText || "").trim()) {
    return 0;
  }

  const fontSize = Number(block?.fontSize) || 11;
  return Math.max(18, Math.round(fontSize * 1.8));
}

function getSignatureImageBottomOffset(block, topText) {
  return Math.max(0, getSignatureTopOffset(block, topText) - 18);
}

function getServiceLayoutPreset(serviceKey = DEFAULT_SERVICE_KEY) {
  return SERVICE_LAYOUT_PRESETS[serviceKey] || null;
}

function applyServiceLayoutPreset(template, serviceKey = DEFAULT_SERVICE_KEY) {
  const preset = getServiceLayoutPreset(serviceKey);

  if (!preset) {
    return template;
  }

  return {
    ...template,
    pageSize: preset.pageSize || template?.pageSize,
    fontFamily: preset.fontFamily || template?.fontFamily,
  };
}

function createDefaultCertificate(serviceKey = DEFAULT_SERVICE_KEY) {
  const preset = getServiceLayoutPreset(serviceKey);
  const defaultPage = getPageConfig(preset?.pageSize || "A4");

  return {
    themeKey: DEFAULT_CERTIFICATE_THEME_KEY,
    pageSize: defaultPage.value,
    fontFamily: preset?.fontFamily || "arial",
    logoSrc: "",
    logoBlock: {
      x: Math.round((defaultPage.width - 102) / 2),
      y: 72,
      size: 102,
    },
    contentBlock: {
      x: 90,
      y: 352,
      width: 540,
      text: "",
      fontSize: 30,
      bold: false,
      align: "center",
      color: "#0f172a",
    },
    textBlocks: [],
    signatureBlocks: [],
  };
}

function createGuideFooterBlock(pageConfig = getPageConfig()) {
  return {
    id: "default-footer",
    x: 124,
    y: Math.max(0, pageConfig.height - 72),
    width: 548,
    text: CERTIFICATE_GUIDE_FOOTER_TEXT,
    fontSize: 14,
    bold: false,
    align: "left",
    color: "#000000",
  };
}

function isKnownServiceKey(value) {
  return SERVICE_OPTIONS.some((option) => option.value === value);
}

function getServiceLabel(serviceKey) {
  return SERVICE_OPTIONS.find((option) => option.value === serviceKey)?.label || "Certificate";
}

function templateTextHasDynamicPlaceholders(text) {
  return /\[(Client Name|Service Name|Service Type|Issue Date|Date|Company Name|Certificate ID|Issued By|Client Email|Start Date|End Date|Accountant Name|Admin Name|Owner Name|Authorized Signatory Name)\]|{{(client_name|service_name|service_type|issue_date|date|company_name|certificate_id|issued_by|client_email|start_date|end_date|accountant_name|admin_name|owner_name|authorized_signatory_name)}}/i.test(
    String(text || "")
  );
}

function looksLikeLegacyGuideText(text) {
  const normalized = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  return (
    normalized.includes("this is to certify that") &&
    normalized.includes("has successfully completed") &&
    normalized.includes("certificate id:")
  );
}

function normalizeGuideText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim().toLowerCase();
}

function matchesGuideText(value, expected) {
  return normalizeGuideText(value) === normalizeGuideText(expected);
}

function isDefaultGuideSignatureBlock(block) {
  if (!block || typeof block !== "object") {
    return false;
  }

  const label = normalizeGuideText(block.label);
  const hasSignatureImage = String(block.signatureSrc || "").trim() !== "";

  return !hasSignatureImage && (
    label === normalizeGuideText(CERTIFICATE_GUIDE_SIGNATURE_LABEL) ||
    label === normalizeGuideText(LEGACY_GUIDE_SIGNATURE_LABEL) ||
    label === normalizeGuideText(LEGACY_GUIDE_SIGNATURE_LABEL_WITH_COLON) ||
    label === normalizeGuideText(LEGACY_DEFAULT_SIGNATURE_LABEL)
  );
}

function sanitizeLegacyTemplate(template) {
  let nextTemplate = template;
  let changed = false;
  const pageConfig = getPageConfig(template?.pageSize || "A4");

  if (String(template?.contentBlock?.text ?? "").trim() === LEGACY_DEFAULT_CONTENT_TEXT) {
    nextTemplate = {
      ...nextTemplate,
      contentBlock: {
        ...(nextTemplate?.contentBlock || {}),
        text: "",
      },
    };
    changed = true;
  }

  if (
    Array.isArray(nextTemplate?.signatureBlocks) &&
    nextTemplate.signatureBlocks.some((block) => isDefaultGuideSignatureBlock(block))
  ) {
    nextTemplate = {
      ...nextTemplate,
      signatureBlocks: nextTemplate.signatureBlocks.filter((block) => !isDefaultGuideSignatureBlock(block)),
    };
    changed = true;
  }

  if (isDefaultGuideSignatureBlock(nextTemplate?.signatureBlock)) {
    nextTemplate = {
      ...nextTemplate,
      signatureBlock: null,
    };
    changed = true;
  }

  let guideDetected = false;
  const contentText = String(nextTemplate?.contentBlock?.text ?? "").trim();
  if (
    contentText &&
    (
      matchesGuideText(contentText, LEGACY_GUIDE_BODY_WITH_CERTIFICATE_ID_TEXT) ||
      matchesGuideText(contentText, LEGACY_GUIDE_BODY_WITH_SIGNATURE_TEXT) ||
      matchesGuideText(contentText, LEGACY_GUIDE_BODY_TEXT) ||
      (looksLikeLegacyGuideText(contentText) && !templateTextHasDynamicPlaceholders(contentText))
    )
  ) {
    nextTemplate = {
      ...nextTemplate,
      contentBlock: {
        ...(nextTemplate?.contentBlock || {}),
        text: CERTIFICATE_GUIDE_BODY_TEXT,
        fontSize: 18,
        align: "left",
        color: "#000000",
      },
    };
    changed = true;
    guideDetected = true;
  }

  let hasTitleBlock = false;
  let hasGuideFooter = false;
  let hasGuideBody =
    matchesGuideText(contentText, CERTIFICATE_GUIDE_BODY_TEXT) ||
    matchesGuideText(contentText, LEGACY_GUIDE_BODY_WITH_CERTIFICATE_ID_TEXT) ||
    matchesGuideText(contentText, LEGACY_GUIDE_BODY_WITH_SIGNATURE_TEXT);
  if (Array.isArray(nextTemplate?.textBlocks)) {
    const updatedTextBlocks = nextTemplate.textBlocks.map((block) => {
      const text = String(block?.text || "").trim();
      if (text === CERTIFICATE_GUIDE_TITLE_TEXT) {
        hasTitleBlock = true;
      }
      if (matchesGuideText(text, CERTIFICATE_GUIDE_FOOTER_TEXT)) {
        hasGuideFooter = true;
      }
      if (
        matchesGuideText(text, CERTIFICATE_GUIDE_BODY_TEXT) ||
        matchesGuideText(text, LEGACY_GUIDE_BODY_WITH_CERTIFICATE_ID_TEXT) ||
        matchesGuideText(text, LEGACY_GUIDE_BODY_WITH_SIGNATURE_TEXT)
      ) {
        hasGuideBody = true;
      }

      if (
        text &&
        (
          matchesGuideText(text, LEGACY_GUIDE_BODY_WITH_CERTIFICATE_ID_TEXT) ||
          matchesGuideText(text, LEGACY_GUIDE_BODY_WITH_SIGNATURE_TEXT) ||
          matchesGuideText(text, LEGACY_GUIDE_BODY_TEXT) ||
          (looksLikeLegacyGuideText(text) && !templateTextHasDynamicPlaceholders(text))
        )
      ) {
        guideDetected = true;
        changed = true;
        return {
          ...block,
          text: CERTIFICATE_GUIDE_BODY_TEXT,
          fontSize: 18,
          align: "left",
          color: "#000000",
        };
      }

      return block;
    });

    nextTemplate = {
      ...nextTemplate,
      textBlocks: updatedTextBlocks,
    };
  }

  if (guideDetected && !hasTitleBlock) {
    nextTemplate = {
      ...nextTemplate,
      textBlocks: [
        {
          id: "default-title",
          x: 120,
          y: 220,
          width: 554,
          text: CERTIFICATE_GUIDE_TITLE_TEXT,
          fontSize: 24,
          bold: true,
          align: "center",
          color: "#000000",
        },
        ...(Array.isArray(nextTemplate?.textBlocks) ? nextTemplate.textBlocks : []),
      ],
    };
    changed = true;
    hasTitleBlock = true;
  }

  if ((guideDetected || (hasTitleBlock && hasGuideBody)) && !hasGuideFooter) {
    nextTemplate = {
      ...nextTemplate,
      textBlocks: [
        ...(Array.isArray(nextTemplate?.textBlocks) ? nextTemplate.textBlocks : []),
        createGuideFooterBlock(pageConfig),
      ],
    };
    changed = true;
  }

  const signatureBlocks = Array.isArray(nextTemplate?.signatureBlocks) ? nextTemplate.signatureBlocks : [];
  if ((guideDetected || (hasTitleBlock && hasGuideBody)) && !signatureBlocks.length) {
    nextTemplate = {
      ...nextTemplate,
      signatureBlocks: [
        {
          id: "default-authorized-signature",
          x: 474,
          y: 938,
          width: 220,
          label: CERTIFICATE_GUIDE_SIGNATURE_LABEL,
          fontSize: 11,
          color: "#000000",
          signatureSrc: "",
        },
      ],
    };
    changed = true;
  }

  return changed ? nextTemplate : template;
}

function normalizeCertificate(template, serviceKey = DEFAULT_SERVICE_KEY) {
  const defaults = createDefaultCertificate(serviceKey);
  const nextTemplate = applyServiceLayoutPreset(template && typeof template === "object" ? template : {}, serviceKey);
  const themeConfig = getCertificateThemeConfig(nextTemplate.themeKey || defaults.themeKey);

  return {
    ...defaults,
    themeKey: themeConfig.value,
    pageSize: typeof nextTemplate.pageSize === "string" ? nextTemplate.pageSize : defaults.pageSize,
    fontFamily: typeof nextTemplate.fontFamily === "string" ? nextTemplate.fontFamily : defaults.fontFamily,
    logoSrc: typeof nextTemplate.logoSrc === "string" ? nextTemplate.logoSrc : defaults.logoSrc,
    logoBlock: {
      ...defaults.logoBlock,
      ...(nextTemplate.logoBlock && typeof nextTemplate.logoBlock === "object" ? nextTemplate.logoBlock : {}),
    },
    contentBlock: {
      ...defaults.contentBlock,
      ...(nextTemplate.contentBlock && typeof nextTemplate.contentBlock === "object" ? nextTemplate.contentBlock : {}),
    },
    textBlocks: Array.isArray(nextTemplate.textBlocks) ? nextTemplate.textBlocks : defaults.textBlocks,
    signatureBlocks: Array.isArray(nextTemplate.signatureBlocks) ? nextTemplate.signatureBlocks : defaults.signatureBlocks,
  };
}

function hasMeaningfulCertificate(template) {
  if (!template || typeof template !== "object") {
    return false;
  }

  if (String(template.logoSrc || "").trim()) {
    return true;
  }

  if (String(template?.contentBlock?.text || "").trim()) {
    return true;
  }

  if (Array.isArray(template.textBlocks) && template.textBlocks.some((block) => String(block?.text || "").trim())) {
    return true;
  }

  if (Array.isArray(template.signatureBlocks) && template.signatureBlocks.length > 0) {
    return true;
  }

  return false;
}

function normalizeStoredTemplateEntry(entry, index = 0) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const serviceKey = isKnownServiceKey(entry.serviceKey) ? entry.serviceKey : DEFAULT_SERVICE_KEY;
  const normalizedTemplate = normalizeCertificate(
    sanitizeLegacyTemplate(entry.template),
    serviceKey
  );

  if (!hasMeaningfulCertificate(normalizedTemplate)) {
    return null;
  }

  return {
    id: typeof entry.id === "string" && entry.id.trim() ? entry.id : `certificate-${serviceKey}-${index + 1}`,
    serviceKey,
    template: normalizedTemplate,
    createdAt: typeof entry.createdAt === "string" ? entry.createdAt : null,
    updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : null,
    editorUserId: Number.isInteger(entry.editorUserId) ? entry.editorUserId : null,
    editorName: typeof entry.editorName === "string" && entry.editorName.trim() ? entry.editorName.trim() : null,
  };
}

function normalizeStoredTemplateEntries(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.reduce((accumulator, entry, index) => {
    const normalizedEntry = normalizeStoredTemplateEntry(entry, index);

    if (normalizedEntry) {
      accumulator.push(normalizedEntry);
    }

    return accumulator;
  }, []);
}

function migrateLegacyTemplateMap(templates) {
  return SERVICE_OPTIONS.reduce((accumulator, option, index) => {
    if (!Object.prototype.hasOwnProperty.call(templates || {}, option.value)) {
      return accumulator;
    }

    const normalizedTemplate = normalizeCertificate(
      sanitizeLegacyTemplate(templates[option.value]),
      option.value
    );

    if (!hasMeaningfulCertificate(normalizedTemplate)) {
      return accumulator;
    }

    accumulator.push({
      id: `certificate-${option.value}-${index + 1}`,
      serviceKey: option.value,
      template: normalizedTemplate,
      createdAt: null,
      updatedAt: null,
      editorUserId: null,
      editorName: null,
    });

    return accumulator;
  }, []);
}

function getSelectedTemplateIds(rawSelectedTemplateIds, savedTemplates, fallbackTemplateId = null, { allowEmpty = false } = {}) {
  const validTemplateIds = savedTemplates.map((entry) => entry.id);
  const normalizedSelectedTemplateIds = Array.isArray(rawSelectedTemplateIds)
    ? rawSelectedTemplateIds.filter(
        (templateId, index) => validTemplateIds.includes(templateId) && rawSelectedTemplateIds.indexOf(templateId) === index
      )
    : [];

  if (normalizedSelectedTemplateIds.length > 0) {
    return normalizedSelectedTemplateIds.slice(0, MAX_SELECTED_TEMPLATES);
  }

  if (allowEmpty && Array.isArray(rawSelectedTemplateIds)) {
    return [];
  }

  if (fallbackTemplateId && validTemplateIds.includes(fallbackTemplateId)) {
    return [fallbackTemplateId];
  }

  return validTemplateIds.length > 0 ? [validTemplateIds[0]] : [];
}

function parseStoredCertificateState(rawValue) {
  if (!rawValue) {
    return {
      selectedService: DEFAULT_SERVICE_KEY,
      activeTemplateId: null,
      selectedTemplateIds: [],
      savedTemplates: [],
      shouldMigrate: false,
    };
  }

  const parsed = JSON.parse(rawValue);

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Array.isArray(parsed.templates)) {
    const savedTemplates = normalizeStoredTemplateEntries(parsed.templates);
    const activeTemplate =
      savedTemplates.find((entry) => entry.id === parsed.selectedTemplateId) || savedTemplates[0] || null;
    const fallbackService =
      activeTemplate?.serviceKey || (isKnownServiceKey(parsed.selectedService) ? parsed.selectedService : DEFAULT_SERVICE_KEY);
    const rawSelectedTemplateIds = Array.isArray(parsed.selectedTemplateIds)
      ? parsed.selectedTemplateIds
      : Array.isArray(parsed.selectedServices)
        ? parsed.selectedServices
            .map((serviceKey) => savedTemplates.find((entry) => entry.serviceKey === serviceKey)?.id || null)
            .filter(Boolean)
        : [];

    return {
      selectedService: fallbackService,
      activeTemplateId: activeTemplate?.id || null,
      selectedTemplateIds: getSelectedTemplateIds(rawSelectedTemplateIds, savedTemplates, activeTemplate?.id || null, {
        allowEmpty: Array.isArray(parsed.selectedTemplateIds) || Array.isArray(parsed.selectedServices),
      }),
      savedTemplates,
      shouldMigrate: false,
    };
  }

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.templates && typeof parsed.templates === "object") {
    const savedTemplates = migrateLegacyTemplateMap(parsed.templates);
    const activeTemplate =
      savedTemplates.find((entry) => entry.serviceKey === parsed.selectedService) || savedTemplates[0] || null;
    const rawSelectedTemplateIds = Array.isArray(parsed.selectedServices)
      ? parsed.selectedServices
          .map((serviceKey) => savedTemplates.find((entry) => entry.serviceKey === serviceKey)?.id || null)
          .filter(Boolean)
      : [];

    return {
      selectedService: activeTemplate?.serviceKey || DEFAULT_SERVICE_KEY,
      activeTemplateId: activeTemplate?.id || null,
      selectedTemplateIds: getSelectedTemplateIds(rawSelectedTemplateIds, savedTemplates, activeTemplate?.id || null, {
        allowEmpty: Array.isArray(parsed.selectedServices),
      }),
      savedTemplates,
      shouldMigrate: true,
    };
  }

  const normalizedTemplate = normalizeCertificate(
    sanitizeLegacyTemplate(parsed),
    DEFAULT_SERVICE_KEY
  );
  const savedTemplates = hasMeaningfulCertificate(normalizedTemplate)
    ? [
        {
          id: "certificate-tax_filing-1",
          serviceKey: DEFAULT_SERVICE_KEY,
          template: normalizedTemplate,
          createdAt: null,
          updatedAt: null,
          editorUserId: null,
          editorName: null,
        },
      ]
    : [];

  return {
    selectedService: DEFAULT_SERVICE_KEY,
    activeTemplateId: savedTemplates[0]?.id || null,
    selectedTemplateIds: savedTemplates[0] ? [savedTemplates[0].id] : [],
    savedTemplates,
    shouldMigrate: savedTemplates.length > 0,
  };
}

function parseRemoteCertificateState(rawState) {
  return parseStoredCertificateState(JSON.stringify(rawState ?? null));
}

function getPreviewScale(pageWidth) {
  return Number(Math.min(1, PREVIEW_TARGET_WIDTH / pageWidth).toFixed(4));
}

function getLogoStyle(template) {
  return {
    left: `${template.logoBlock.x}px`,
    top: `${template.logoBlock.y}px`,
    width: `${template.logoBlock.size}px`,
    height: `${template.logoBlock.size}px`,
  };
}

function getContentStyle(template, fontFamily) {
  return {
    left: `${template.contentBlock.x}px`,
    top: `${template.contentBlock.y}px`,
    width: `${template.contentBlock.width}px`,
    fontSize: `${template.contentBlock.fontSize}px`,
    fontWeight: template.contentBlock.bold ? 700 : 400,
    textAlign: template.contentBlock.align,
    color: template.contentBlock.color,
    fontFamily,
  };
}

function getTextBlockStyle(block, fontFamily) {
  return {
    left: `${block.x}px`,
    top: `${block.y}px`,
    width: `${block.width}px`,
    fontSize: `${block.fontSize}px`,
    fontWeight: block.bold ? 700 : 400,
    textAlign: block.align,
    color: block.color,
    fontFamily,
  };
}

function getSignatureStyle(block, fontFamily) {
  return {
    left: `${block.x}px`,
    top: `${block.y}px`,
    width: `${block.width}px`,
    fontSize: `${block.fontSize || 11}px`,
    color: block.color || "#000000",
    fontFamily,
  };
}

function getSignatureImageHeight(block) {
  const width = Number(block?.width) || 220;
  return Math.max(48, Math.min(96, Math.round(width * 0.28)));
}

function CertificatePreviewCard({
  entry,
  isSelected = false,
  onView,
  onEdit,
  onRemove,
  canEdit = false,
  canRemove = false,
  canManageAutoSend = false,
}) {
  const scale = getPreviewScale(entry.pageConfig.width);
  const scaledWidth = entry.pageConfig.width * scale;
  const scaledHeight = entry.pageConfig.height * scale;
  const themeConfig = getCertificateThemeConfig(entry.template.themeKey);
  const themeBadgeStyle = getCertificateThemeBadgeStyle(entry.template.themeKey);
  const hasLogo = Boolean(entry.template.logoSrc);
  const hasMainContent = Boolean(String(entry.template.contentBlock?.text || "").trim());
  const buttonLabel = isSelected ? "Remove auto-send" : "Use for auto-send";
  const templateStatus = hasLogo ? "Includes logo" : "No logo";
  const editorLabel = entry.editorName ? `Last edited by ${entry.editorName}` : "Last editor unavailable";

  return (
    <div
      className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-4 transition-all hover:border-slate-300 hover:shadow-[0_16px_38px_rgba(15,23,42,0.08)]"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-800">{entry.label}</div>
          <div className="mt-1 text-xs text-slate-500">
            Page Size: {entry.pageConfig.label} | Font: {entry.fontConfig.label} | Theme: {themeConfig.label}
          </div>
          <div className="mt-1 text-xs text-slate-500">{editorLabel}</div>
        </div>
        <div
          className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
          style={themeBadgeStyle}
        >
          {themeConfig.label}
        </div>
      </div>

      <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white/70 p-3">
        <div
          className="mx-auto"
          style={{
            width: `${scaledWidth}px`,
            height: `${scaledHeight}px`,
          }}
        >
          <div
            className="relative overflow-hidden rounded-[28px]"
            style={{
              ...getCertificateThemeShellStyle(themeConfig.value),
              width: `${entry.pageConfig.width}px`,
              height: `${entry.pageConfig.height}px`,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            <CertificateThemeLayers themeKey={themeConfig.value} />
            {hasLogo ? (
              <div
                className="absolute z-20 grid place-items-center overflow-hidden rounded-full"
                style={{
                  ...getLogoStyle(entry.template),
                  ...getCertificateThemeLogoStyle(themeConfig.value),
                }}
              >
                <img
                  src={entry.template.logoSrc}
                  alt={`${entry.label} certificate logo`}
                  className="h-full w-full rounded-full object-cover"
                  draggable={false}
                />
              </div>
            ) : null}

            {hasMainContent ? (
              <div
                className="absolute z-10 whitespace-pre-wrap break-words font-sans leading-[1.55]"
                style={getContentStyle(entry.template, entry.fontConfig.family)}
              >
                {entry.template.contentBlock.text}
              </div>
            ) : null}

            {entry.template.textBlocks.map((block, index) => (
              <div
                key={block.id || `text-${index}`}
                className="absolute z-10 whitespace-pre-wrap break-words font-sans leading-[1.45]"
                style={getTextBlockStyle(block, entry.fontConfig.family)}
              >
                {block.text}
              </div>
            ))}

            {entry.template.signatureBlocks.map((block, index) => {
              const signatureLabelParts = getSignatureLabelParts(block.label);
              const signatureImageBottomOffset = getSignatureImageBottomOffset(block, signatureLabelParts.topText);

              return (
                <div
                  key={block.id || `signature-${index}`}
                  className="absolute z-10 text-center font-sans"
                  style={getSignatureStyle(block, entry.fontConfig.family)}
                >
                  {block.signatureSrc ? (
                    <img
                      src={block.signatureSrc}
                      alt=""
                      className="absolute left-1/2 max-w-[92%] -translate-x-1/2 object-contain"
                      style={{
                        bottom: `calc(100% + ${signatureImageBottomOffset}px)`,
                        height: `${getSignatureImageHeight(block)}px`,
                      }}
                      draggable={false}
                    />
                  ) : null}
                  {signatureLabelParts.topText ? (
                    <div
                      className="absolute left-1/2 w-full -translate-x-1/2 whitespace-pre-wrap break-words font-semibold uppercase tracking-[0.18em]"
                      style={{ bottom: "calc(100% + 6px)" }}
                    >
                      {signatureLabelParts.topText}
                    </div>
                  ) : null}
                  <div className="h-px" style={{ backgroundColor: block.color || "#000000" }} />
                  {signatureLabelParts.bottomText ? (
                    <div className="mt-2 whitespace-pre-wrap break-words font-semibold uppercase tracking-[0.18em]">
                      {signatureLabelParts.bottomText}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500">{templateStatus}</div>
          {isSelected ? (
            <div className="mt-1 text-xs font-medium text-slate-700">Selected for automatic certificate delivery.</div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <Button variant="secondary" size="sm" onClick={() => onEdit?.(entry.templateId)}>
              Edit
            </Button>
          ) : null}
          {canRemove ? (
            <Button variant="danger" size="sm" onClick={() => onRemove?.(entry.templateId)}>
              Remove
            </Button>
          ) : null}
          {canManageAutoSend ? (
            <Button
              variant={isSelected ? "secondary" : "primary"}
              size="sm"
              onClick={() => onView?.(entry.templateId)}
            >
              {buttonLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function CertificatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { permissions } = useModulePermissions();
  const certificateWorkspaceBasePath = useMemo(
    () => getCertificateWorkspaceBasePath(location.pathname),
    [location.pathname]
  );
  const canOpenEditCertificatePage = hasModuleAccess(user, "edit-certificate", permissions);
  const canEditCertificateTemplate = canOpenEditCertificatePage && hasFeatureActionAccess(user, "certificate", "edit", permissions);
  const canRemoveCertificateTemplate = hasFeatureActionAccess(user, "certificate", "remove", permissions);
  const canManageCertificateAutoSend = hasFeatureActionAccess(user, "certificate", "remove-auto-send", permissions);
  const previewCarouselRef = useRef(null);
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [canScrollPreviewLeft, setCanScrollPreviewLeft] = useState(false);
  const [canScrollPreviewRight, setCanScrollPreviewRight] = useState(false);
  const [previewSearchTerm, setPreviewSearchTerm] = useState("");

  useEffect(() => {
    let isCancelled = false;

    const applyState = (parsedState) => {
      if (isCancelled) return;
      setSelectedTemplateIds(parsedState.selectedTemplateIds);
      setSavedTemplates(parsedState.savedTemplates);
    };

    const hydrateTemplates = async () => {
      setIsLoading(true);

      try {
        const response = await fetchCertificateTemplates();
        const parsedState = parseRemoteCertificateState(response?.data?.state);
        applyState(parsedState);
      } catch (_) {
        applyState(parseRemoteCertificateState(null));
        showErrorToast("Certificate templates could not be loaded.");
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    hydrateTemplates();

    return () => {
      isCancelled = true;
    };
  }, []);

  const savedCertificateEntries = useMemo(
    () => {
      const serviceCounts = {};

      return savedTemplates.map((entry) => {
        serviceCounts[entry.serviceKey] = (serviceCounts[entry.serviceKey] || 0) + 1;
        const serviceLabel = getServiceLabel(entry.serviceKey);
        const templateLabel =
          serviceCounts[entry.serviceKey] > 1 ? `${serviceLabel} ${serviceCounts[entry.serviceKey]}` : serviceLabel;
        const template = normalizeCertificate(entry.template, entry.serviceKey);

        return {
          templateId: entry.id,
          serviceKey: entry.serviceKey,
          serviceLabel,
          label: templateLabel,
          template,
          pageConfig: getPageConfig(template.pageSize),
          fontConfig: getFontConfig(template.fontFamily),
          editorUserId: entry.editorUserId,
          editorName: entry.editorName,
        };
      });
    },
    [savedTemplates]
  );
  const hasSavedTemplate = savedCertificateEntries.length > 0;
  const normalizedPreviewSearch = previewSearchTerm.trim().toLowerCase();
  const visibleCertificateEntries = useMemo(
    () =>
      savedCertificateEntries.filter((entry) => {
        if (!normalizedPreviewSearch) {
          return true;
        }

        return (
          entry.label.toLowerCase().includes(normalizedPreviewSearch) ||
          entry.serviceLabel.toLowerCase().includes(normalizedPreviewSearch) ||
          entry.pageConfig.label.toLowerCase().includes(normalizedPreviewSearch) ||
          entry.fontConfig.label.toLowerCase().includes(normalizedPreviewSearch)
        );
      }),
    [savedCertificateEntries, normalizedPreviewSearch]
  );
  const shouldShowPreviewArrows = visibleCertificateEntries.length >= PREVIEW_NAVIGATION_THRESHOLD;
  const savedPreviewDescription = "Create templates here, then select one template per service for automatic delivery.";

  const applyParsedState = (parsedState) => {
    setSelectedTemplateIds(parsedState.selectedTemplateIds);
    setSavedTemplates(parsedState.savedTemplates);
  };

  const handleViewCertificate = async (templateId) => {
    if (!canManageCertificateAutoSend) {
      return;
    }

    const targetTemplate = savedTemplates.find((entry) => entry.id === templateId);
    if (!targetTemplate) {
      return;
    }

    const currentlySelected = selectedTemplateIds.includes(templateId);
    const nextSelectedTemplateIds =
      currentlySelected
        ? selectedTemplateIds.filter((currentId) => currentId !== templateId)
        : [
            ...selectedTemplateIds.filter((currentId) => {
              if (currentId === templateId) return false;
              const currentTemplate = savedTemplates.find((entry) => entry.id === currentId);
              return currentTemplate?.serviceKey !== targetTemplate.serviceKey;
            }),
            templateId,
          ].slice(-MAX_SELECTED_TEMPLATES);

    try {
      const response = await saveSelectedCertificateTemplates(nextSelectedTemplateIds);
      applyParsedState(parseRemoteCertificateState(response?.data?.state));
      showSuccessToast(
        currentlySelected
          ? `${getServiceLabel(targetTemplate.serviceKey)} auto-send template removed.`
          : `${getServiceLabel(targetTemplate.serviceKey)} auto-send template selected.`
      );
    } catch (error) {
      showErrorToast(error?.response?.data?.message || "Certificate template selection could not be updated.");
    }
  };

  const handleEditCertificate = (templateId) => {
    if (!canEditCertificateTemplate) {
      return;
    }

    const targetTemplate = savedTemplates.find((entry) => entry.id === templateId);
    if (!targetTemplate) {
      return;
    }

    navigate(`${certificateWorkspaceBasePath}/certificate/edit?template=${encodeURIComponent(templateId)}`);
  };

  const handleRemoveCertificate = async (templateId) => {
    if (!canRemoveCertificateTemplate) {
      return;
    }

    const targetTemplate = savedTemplates.find((entry) => entry.id === templateId);
    if (!targetTemplate) {
      return;
    }

    const confirmation = await Swal.fire({
      title: "Remove saved certificate?",
      text: 'Type "remove" to confirm this action.',
      icon: "warning",
      background: "#ffffff",
      color: "#0f172a",
      input: "text",
      inputLabel: "Confirmation",
      inputPlaceholder: "Type remove",
      showCancelButton: true,
      confirmButtonText: "Remove",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#94a3b8",
      reverseButtons: true,
      focusCancel: true,
      didOpen: () => {
        const popup = Swal.getPopup();
        const input = Swal.getInput();
        const confirmButton = Swal.getConfirmButton();
        const cancelButton = Swal.getCancelButton();
        if (popup) {
          popup.style.backgroundColor = "#ffffff";
          popup.style.color = "#0f172a";
        }
        if (input) {
          input.style.backgroundColor = "#ffffff";
          input.style.color = "#0f172a";
          input.style.borderColor = "#cbd5e1";
        }
        if (confirmButton) {
          confirmButton.style.backgroundColor = "#dc2626";
          confirmButton.style.color = "#ffffff";
          confirmButton.style.border = "1px solid #dc2626";
          confirmButton.style.boxShadow = "none";
        }
        if (cancelButton) {
          cancelButton.style.backgroundColor = "#e2e8f0";
          cancelButton.style.color = "#0f172a";
          cancelButton.style.border = "1px solid #cbd5e1";
          cancelButton.style.boxShadow = "none";
        }
      },
      preConfirm: (value) => {
        if (String(value || "").trim().toLowerCase() !== "remove") {
          Swal.showValidationMessage('Please type "remove" to continue.');
          return false;
        }
        return true;
      },
    });

    if (!confirmation.isConfirmed) {
      return;
    }

    try {
      const response = await deleteCertificateTemplateRequest(templateId);
      applyParsedState(parseRemoteCertificateState(response?.data?.state));
      showSuccessToast("Saved certificate removed.");
    } catch (error) {
      showErrorToast(error?.response?.data?.message || "Saved certificate could not be removed.");
    }
  };

  const handlePreviewScroll = (direction) => {
    const previewCarousel = previewCarouselRef.current;

    if (!previewCarousel) {
      return;
    }

    const scrollAmount = previewCarousel.clientWidth;
    previewCarousel.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    const previewCarousel = previewCarouselRef.current;

    if (!hasSavedTemplate || !shouldShowPreviewArrows || !previewCarousel) {
      setCanScrollPreviewLeft(false);
      setCanScrollPreviewRight(false);
      return undefined;
    }

    const updatePreviewScrollState = () => {
      const maxScrollLeft = Math.max(0, previewCarousel.scrollWidth - previewCarousel.clientWidth);
      setCanScrollPreviewLeft(previewCarousel.scrollLeft > 8);
      setCanScrollPreviewRight(previewCarousel.scrollLeft < maxScrollLeft - 8);
    };

    updatePreviewScrollState();
    previewCarousel.addEventListener("scroll", updatePreviewScrollState, { passive: true });
    window.addEventListener("resize", updatePreviewScrollState);

    return () => {
      previewCarousel.removeEventListener("scroll", updatePreviewScrollState);
      window.removeEventListener("resize", updatePreviewScrollState);
    };
  }, [hasSavedTemplate, shouldShowPreviewArrows, visibleCertificateEntries.length]);

  return (
    <div className="space-y-6">
      <Card className="border-slate-200/90 bg-white">
        <CardHeader
          title="Certificate Templates"
          description={savedPreviewDescription}
          action={
            canOpenEditCertificatePage ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate(`${certificateWorkspaceBasePath}/certificate/edit`)}
              >
                <Plus className="h-4 w-4" />
                Create Template
              </Button>
            ) : null
          }
        />
        <CardContent>
          {isLoading ? (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/70 px-6 py-12 text-center">
              <div className="text-base font-semibold text-slate-800">Loading certificate templates</div>
              <div className="mt-2 text-sm text-slate-500">
                Please wait while saved templates are loaded from the database.
              </div>
            </div>
          ) : hasSavedTemplate ? (
            <div className="mb-4 flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label className="relative block w-full sm:max-w-[280px]">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={previewSearchTerm}
                  onChange={(event) => setPreviewSearchTerm(event.target.value)}
                  placeholder="Search certificates"
                  aria-label="Search saved certificates"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                />
              </label>

              {shouldShowPreviewArrows ? (
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <IconButton
                    variant="outline"
                    size="sm"
                    aria-label="Scroll certificate previews left"
                    disabled={!canScrollPreviewLeft}
                    onClick={() => handlePreviewScroll("left")}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    variant="outline"
                    size="sm"
                    aria-label="Scroll certificate previews right"
                    disabled={!canScrollPreviewRight}
                    onClick={() => handlePreviewScroll("right")}
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </IconButton>
                </div>
              ) : null}
            </div>
          ) : null}
          {!isLoading && hasSavedTemplate ? (
            visibleCertificateEntries.length > 0 ? (
            shouldShowPreviewArrows ? (
              <div
                ref={previewCarouselRef}
                className="flex gap-4 overflow-x-auto scroll-smooth pb-2"
              >
                {visibleCertificateEntries.map((entry) => (
                  <div
                    key={entry.templateId}
                    data-template-id={entry.templateId}
                    className="w-full shrink-0 lg:w-[calc((100%-1rem)/2)]"
                  >
                    <CertificatePreviewCard
                      entry={entry}
                      isSelected={selectedTemplateIds.includes(entry.templateId)}
                      onView={handleViewCertificate}
                      onEdit={handleEditCertificate}
                      onRemove={handleRemoveCertificate}
                      canEdit={canEditCertificateTemplate}
                      canRemove={canRemoveCertificateTemplate}
                      canManageAutoSend={canManageCertificateAutoSend}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {visibleCertificateEntries.map((entry) => (
                  <CertificatePreviewCard
                    key={entry.templateId}
                    entry={entry}
                    isSelected={selectedTemplateIds.includes(entry.templateId)}
                    onView={handleViewCertificate}
                    onEdit={handleEditCertificate}
                    onRemove={handleRemoveCertificate}
                    canEdit={canEditCertificateTemplate}
                    canRemove={canRemoveCertificateTemplate}
                    canManageAutoSend={canManageCertificateAutoSend}
                  />
                ))}
              </div>
            )
            ) : (
              <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/70 px-6 py-12 text-center">
                <div className="text-base font-semibold text-slate-800">No matching certificates found</div>
                <div className="mt-2 text-sm text-slate-500">
                  Try a different search term to find a saved certificate.
                </div>
              </div>
            )
          ) : (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/70 px-6 py-12 text-center">
              <div className="text-base font-semibold text-slate-800">No certificate created yet</div>
              <div className="mt-2 text-sm text-slate-500">
                Nothing will be displayed here until you save a certificate template from the editor.
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
