import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import SignatureCanvas from "react-signature-canvas";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useReactToPrint } from "react-to-print";
import { Button } from "../../components/UI/buttons";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/UI/card";
import CertificateThemeLayers from "../../components/certificate/CertificateThemeLayers";
import { useModulePermissions } from "../../context/ModulePermissionsContext";
import { useAuth } from "../../hooks/useAuth";
import { showErrorToast, showInfoToast, showSuccessToast } from "../../utils/feedback";
import {
  CERTIFICATE_THEME_OPTIONS,
  DEFAULT_CERTIFICATE_THEME_KEY,
  getCertificateThemeBadgeStyle,
  getCertificateThemeConfig,
  getCertificateThemeLogoStyle,
  getCertificateThemeShellStyle,
} from "../../utils/certificate_theme";
import { hasFeatureActionAccess } from "../../utils/module_permissions";
import { fetchCertificateTemplates, saveCertificateTemplate } from "../../services/api";

const FIELD_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20";
const HEADER_SELECT_CLASS =
  "h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20";
const LABEL_CLASS = "text-xs font-semibold uppercase tracking-[0.16em] text-slate-500";
const LOGO_SIZE = 102;
const SIGNATURE_PAD_HEIGHT = 220;
const TEXT_ALIGNMENTS = ["", "left", "center", "right"];
const DEFAULT_PAGE_SIZE = "A4";
const DEFAULT_FONT_KEY = "arial";
const HORIZONTAL_ALIGNMENT_GUTTER = 100;
const VERTICAL_DRAG_GUTTER = 72;
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
const SERVICE_OPTIONS = [
  { value: "tax_filing", label: "Tax Filing" },
  { value: "bookkeeping", label: "Bookkeeping" },
  { value: "auditing", label: "Auditing" },
];
const DEFAULT_SERVICE_KEY = SERVICE_OPTIONS[0].value;
const MAX_SELECTED_TEMPLATES = 3;
const SERVICE_LAYOUT_PRESETS = {
  tax_filing: {
    pageSize: DEFAULT_PAGE_SIZE,
    fontFamily: DEFAULT_FONT_KEY,
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
const PLACEHOLDER_DROPDOWN_OPTIONS = [
  "[CLIENT NAME]",
  "[SERVICE TYPE]",
  "[COMPANY NAME]",
  "[START DATE]",
  "[END DATE]",
  "[DATE]",
  "[AUTHORIZED SIGNATORY NAME]",
  "[CERTIFICATE ID]",
  "[ADMIN NAME]",
  "[ACCOUNTANT NAME]",
];

function getCertificateWorkspaceBasePath(pathname) {
  return String(pathname || "").startsWith("/secretary") ? "/secretary" : "/admin";
}

function getPageConfig(pageSize = DEFAULT_PAGE_SIZE) {
  return PAGE_SIZE_OPTIONS.find((option) => option.value === pageSize) || PAGE_SIZE_OPTIONS[0];
}

function getFontConfig(fontKey = DEFAULT_FONT_KEY) {
  return FONT_OPTIONS.find((option) => option.value === fontKey) || FONT_OPTIONS[0];
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plainTextToTiptapContent(value) {
  const normalized = String(value || "").replace(/\r\n/g, "\n");
  const paragraphs = normalized.split(/\n{2,}/);

  if (!paragraphs.length) {
    return "<p></p>";
  }

  return paragraphs
    .map((paragraph) => {
      const text = escapeHtml(paragraph).replace(/\n/g, "<br />");
      return `<p>${text || "<br />"}</p>`;
    })
    .join("");
}

function tiptapEditorToPlainText(editor) {
  return String(editor?.getText({ blockSeparator: "\n\n" }) || "").replace(/\u00a0/g, " ");
}

function getCanvasAxisBounds(itemSize, pageSize, gutter = 0) {
  const maxPosition = Math.max(0, pageSize - itemSize);
  const safeGutter = Math.min(Math.max(0, gutter), Math.floor(maxPosition / 2));

  return {
    min: safeGutter,
    max: Math.max(safeGutter, maxPosition - safeGutter),
  };
}

function getAlignedCanvasX(alignment, itemWidth, pageWidth, gutter = HORIZONTAL_ALIGNMENT_GUTTER) {
  const { min, max } = getCanvasAxisBounds(itemWidth, pageWidth, gutter);
  const maxX = Math.max(0, pageWidth - itemWidth);

  if (alignment === "left") {
    return min;
  }

  if (alignment === "right") {
    return max;
  }

  return Math.round(maxX / 2);
}

function TiptapPlainTextField({
  editorKey,
  value,
  onChange,
  onFocusEditor = () => {},
  registerEditor = () => {},
  unregisterEditor = () => {},
  minHeightClass = "min-h-[120px]",
}) {
  const latestValueRef = useRef(String(value || ""));
  latestValueRef.current = String(value || "");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
      }),
    ],
    content: plainTextToTiptapContent(value),
    editorProps: {
      attributes: {
        class: `${minHeightClass} w-full px-3 py-2 text-sm leading-6 text-slate-700 outline-none whitespace-pre-wrap`,
      },
    },
    onFocus: ({ editor: activeEditor }) => onFocusEditor(editorKey, activeEditor),
    onSelectionUpdate: ({ editor: activeEditor }) => onFocusEditor(editorKey, activeEditor),
    onUpdate: ({ editor: activeEditor }) => {
      const nextValue = tiptapEditorToPlainText(activeEditor);
      if (nextValue !== latestValueRef.current) {
        onChange(nextValue);
      }
    },
  });

  useEffect(() => {
    if (!editor) {
      return undefined;
    }

    registerEditor(editorKey, editor);
    return () => unregisterEditor(editorKey);
  }, [editor, editorKey, registerEditor, unregisterEditor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const normalizedValue = String(value || "");
    if (tiptapEditorToPlainText(editor) !== normalizedValue) {
      editor.commands.setContent(plainTextToTiptapContent(normalizedValue), false);
    }
  }, [editor, value]);

  return (
    <div className="mt-1 overflow-hidden rounded-lg border border-slate-300 bg-white transition focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20">
      <EditorContent editor={editor} />
    </div>
  );
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

function getPrintPageStyle(pageConfig) {
  const pageWidthMm = Number(((pageConfig.width / 96) * 25.4).toFixed(2));
  const pageHeightMm = Number(((pageConfig.height / 96) * 25.4).toFixed(2));

  return `
    @page {
      size: ${pageWidthMm}mm ${pageHeightMm}mm;
      margin: 0;
    }

    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: ${pageWidthMm}mm !important;
      height: ${pageHeightMm}mm !important;
      background: #ffffff !important;
      overflow: hidden !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .certificate-print-root {
      display: block !important;
      width: ${pageWidthMm}mm !important;
      height: ${pageHeightMm}mm !important;
      overflow: hidden !important;
    }

    .certificate-print-page {
      padding: 0 !important;
      width: ${pageWidthMm}mm !important;
      height: ${pageHeightMm}mm !important;
      overflow: hidden !important;
      break-after: avoid-page !important;
      page-break-after: avoid !important;
    }

    .certificate-print-sheet {
      width: ${pageWidthMm}mm !important;
      height: ${pageHeightMm}mm !important;
      margin: 0 !important;
      box-shadow: none !important;
      border: none !important;
      break-inside: avoid-page !important;
      page-break-inside: avoid !important;
    }
  `;
}

function getDefaultAddedTextLabel(index) {
  return `Text ${index + 1}`;
}

function createBlockId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function createDefaultAddedText(overrides = {}) {
  return {
    id: createBlockId("text"),
    x: 120,
    y: 770,
    width: 480,
    text: "",
    fontSize: 18,
    bold: false,
    align: "",
    color: "#000000",
    ...overrides,
  };
}

function createDefaultSignatureLine(overrides = {}) {
  return {
    id: createBlockId("signature"),
    x: 92,
    y: 865,
    width: 220,
    label: CERTIFICATE_GUIDE_SIGNATURE_LABEL,
    fontSize: 11,
    color: "#000000",
    signatureSrc: "",
    ...overrides,
  };
}

function createAssetLabel(prefix, templateEntry, index) {
  const serviceLabel = getServiceLabel(templateEntry?.serviceKey || DEFAULT_SERVICE_KEY);
  const editorName = String(templateEntry?.editorName || "").trim();
  if (editorName) {
    return `${prefix} ${index + 1} • ${serviceLabel} • ${editorName}`;
  }
  return `${prefix} ${index + 1} • ${serviceLabel}`;
}

function collectReusableLogoAssets(savedTemplates = []) {
  const seen = new Set();
  const assets = [];

  savedTemplates.forEach((entry) => {
    const logoSrc = String(entry?.template?.logoSrc || "").trim();
    if (!logoSrc || seen.has(logoSrc)) {
      return;
    }

    seen.add(logoSrc);
    assets.push({
      id: `logo-${assets.length + 1}`,
      src: logoSrc,
      label: createAssetLabel("Logo", entry, assets.length),
    });
  });

  return assets;
}

function collectReusableSignatureAssets(savedTemplates = []) {
  const seen = new Set();
  const assets = [];

  savedTemplates.forEach((entry) => {
    const signatureBlocks = Array.isArray(entry?.template?.signatureBlocks) ? entry.template.signatureBlocks : [];
    signatureBlocks.forEach((block) => {
      const signatureSrc = String(block?.signatureSrc || "").trim();
      if (!signatureSrc || seen.has(signatureSrc)) {
        return;
      }

      seen.add(signatureSrc);
      assets.push({
        id: `signature-${assets.length + 1}`,
        src: signatureSrc,
        label: createAssetLabel("Signature", entry, assets.length),
      });
    });
  });

  return assets;
}

function EditableNumberInput({ value, min = 0, max = Number.MAX_SAFE_INTEGER, onValueChange, className = FIELD_CLASS }) {
  const [draft, setDraft] = useState(String(value ?? ""));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setDraft(String(value ?? ""));
    }
  }, [isFocused, value]);

  const commitDraft = useCallback(
    (rawValue) => {
      const text = String(rawValue ?? "").trim();
      if (!/^\d+$/.test(text)) {
        return false;
      }

      const nextValue = clampNumber(Number(text), min, max, value);
      onValueChange(nextValue);
      setDraft(String(nextValue));
      return true;
    },
    [max, min, onValueChange, value]
  );

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={draft}
      onFocus={() => setIsFocused(true)}
      onChange={(event) => {
        const nextValue = event.target.value;

        if (nextValue === "" || /^\d+$/.test(nextValue)) {
          setDraft(nextValue);

          if (nextValue !== "") {
            onValueChange(clampNumber(Number(nextValue), min, max, value));
          }
        }
      }}
      onBlur={() => {
        setIsFocused(false);

        if (!commitDraft(draft)) {
          setDraft(String(value ?? ""));
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
}

function templateTextHasDynamicPlaceholders(text) {
  return /\[(Client Name|Service Name|Service Type|Issue Date|Date|Company Name|Certificate ID|Issued By|Client Email|Start Date|End Date|Accountant Name|Admin Name|Owner Name|Authorized Signatory Name)\]|{{(client_name|service_name|service_type|issue_date|date|company_name|certificate_id|issued_by|client_email|start_date|end_date|accountant_name|admin_name|owner_name|authorized_signatory_name)}}/i.test(
    String(text || "")
  );
}

function insertPlaceholderAtSelection(currentValue, placeholder, selectionStart, selectionEnd) {
  const source = String(currentValue || "");
  const token = String(placeholder || "");

  if (!token) {
    return { value: source, caretPosition: source.length };
  }

  const safeStart =
    Number.isInteger(selectionStart) && selectionStart >= 0 ? Math.min(selectionStart, source.length) : source.length;
  const safeEnd =
    Number.isInteger(selectionEnd) && selectionEnd >= safeStart ? Math.min(selectionEnd, source.length) : safeStart;
  const nextValue = `${source.slice(0, safeStart)}${token}${source.slice(safeEnd)}`;

  return {
    value: nextValue,
    caretPosition: safeStart + token.length,
  };
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

function createGuideFooterBlock(pageConfig = getPageConfig()) {
  return createDefaultAddedText({
    id: "default-footer",
    x: 124,
    y: Math.max(0, pageConfig.height - 72),
    width: 548,
    text: CERTIFICATE_GUIDE_FOOTER_TEXT,
    fontSize: 14,
    bold: false,
    align: "left",
    color: "#000000",
  });
}

function createGuideTextBlocks(pageConfig = getPageConfig()) {
  
  return [
    createDefaultAddedText({
      id: "default-title",
      x: 120,
      y: 220,
      width: 554,
      text: CERTIFICATE_GUIDE_TITLE_TEXT,
      fontSize: 24,
      bold: true,
      align: "center",
      color: "#000000",
    }),
    createDefaultAddedText({
      id: "default-body",
      x: 124,
      y: 304,
      width: 548,
      text: CERTIFICATE_GUIDE_BODY_TEXT,
      fontSize: 18,
      bold: false,
      align: "left",
      color: "#000000",
    }),
    createGuideFooterBlock(pageConfig),
  ];
}

function createGuideSignatureBlocks(pageConfig = getPageConfig()) {
  return [
    createDefaultSignatureLine({
      id: "default-authorized-signature",
      x: Math.max(0, pageConfig.width - 320),
      y: Math.max(0, pageConfig.height - 185),
      width: 220,
      label: CERTIFICATE_GUIDE_SIGNATURE_LABEL,
    }),
  ];
}

function sanitizeLegacyTemplate(template) {
  let nextTemplate = template;
  let changed = false;
  const pageConfig = getPageConfig(template?.pageSize || DEFAULT_PAGE_SIZE);

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
    const filteredSignatureBlocks = nextTemplate.signatureBlocks.filter(
      (block) => !isDefaultGuideSignatureBlock(block)
    );
    nextTemplate = {
      ...nextTemplate,
      signatureBlocks: filteredSignatureBlocks,
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
      matchesGuideText(contentText, LEGACY_GUIDE_BODY_WITH_SIGNATURE_TEXT) ||
      matchesGuideText(contentText, LEGACY_GUIDE_BODY_WITH_CERTIFICATE_ID_TEXT) ||
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
          matchesGuideText(text, LEGACY_GUIDE_BODY_WITH_SIGNATURE_TEXT) ||
          matchesGuideText(text, LEGACY_GUIDE_BODY_WITH_CERTIFICATE_ID_TEXT) ||
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
      textBlocks: [createGuideTextBlocks(pageConfig)[0], ...(Array.isArray(nextTemplate?.textBlocks) ? nextTemplate.textBlocks : [])],
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
      ].filter(Boolean),
    };
    changed = true;
    hasGuideFooter = true;
  }

  const signatureBlocks = Array.isArray(nextTemplate?.signatureBlocks) ? nextTemplate.signatureBlocks : [];
  if ((guideDetected || (hasTitleBlock && hasGuideBody)) && !signatureBlocks.length) {
    nextTemplate = {
      ...nextTemplate,
      signatureBlocks: createGuideSignatureBlocks(pageConfig),
    };
    changed = true;
  }

  return changed ? nextTemplate : template;
}

function normalizeAlignment(value, fallback) {
  const normalized = String(value ?? "");
  return TEXT_ALIGNMENTS.includes(normalized) ? normalized : fallback;
}

function normalizeAddedText(block, pageConfig) {
  const defaults = createDefaultAddedText();
  const pageWidth = pageConfig.width;
  const pageHeight = pageConfig.height;
  const maxWidth = Math.max(160, pageWidth - HORIZONTAL_ALIGNMENT_GUTTER * 2);
  const width = clampNumber(block?.width, 160, maxWidth, defaults.width);
  const horizontalBounds = getCanvasAxisBounds(width, pageWidth, HORIZONTAL_ALIGNMENT_GUTTER);
  const verticalBounds = getCanvasAxisBounds(40, pageHeight, VERTICAL_DRAG_GUTTER);

  return {
    id: typeof block?.id === "string" && block.id ? block.id : defaults.id,
    x: clampNumber(block?.x, horizontalBounds.min, horizontalBounds.max, defaults.x),
    y: clampNumber(block?.y, verticalBounds.min, verticalBounds.max, defaults.y),
    width,
    text: String(block?.text ?? defaults.text),
    fontSize: clampNumber(block?.fontSize, 12, 48, defaults.fontSize),
    bold: Boolean(block?.bold),
    align: normalizeAlignment(block?.align, defaults.align),
    color: normalizeColor(block?.color, defaults.color),
  };
}

function normalizeSignatureLine(block, pageConfig) {
  const defaults = createDefaultSignatureLine();
  const pageWidth = pageConfig.width;
  const pageHeight = pageConfig.height;
  const maxWidth = Math.max(140, pageWidth - HORIZONTAL_ALIGNMENT_GUTTER * 2);
  const width = clampNumber(block?.width, 140, maxWidth, defaults.width);
  const horizontalBounds = getCanvasAxisBounds(width, pageWidth, HORIZONTAL_ALIGNMENT_GUTTER);
  const verticalBounds = getCanvasAxisBounds(50, pageHeight, VERTICAL_DRAG_GUTTER);

  return {
    id: typeof block?.id === "string" && block.id ? block.id : defaults.id,
    x: clampNumber(block?.x, horizontalBounds.min, horizontalBounds.max, defaults.x),
    y: clampNumber(block?.y, verticalBounds.min, verticalBounds.max, defaults.y),
    width,
    label: String(block?.label ?? defaults.label),
    fontSize: clampNumber(block?.fontSize, 8, 32, defaults.fontSize),
    color: normalizeColor(block?.color, defaults.color),
    signatureSrc: typeof block?.signatureSrc === "string" ? block.signatureSrc : defaults.signatureSrc,
  };
}

function getSignatureImageHeight(block) {
  return clampNumber(Math.round((Number(block?.width) || 220) * 0.28), 48, 96, 62);
}

function trimSignatureCanvas(sourceCanvas) {
  if (!sourceCanvas || typeof document === "undefined") {
    return sourceCanvas;
  }

  const context = sourceCanvas.getContext("2d");
  if (!context) {
    return sourceCanvas;
  }

  const { width, height } = sourceCanvas;
  const { data } = context.getImageData(0, 0, width, height);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha === 0) continue;

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0 || maxY < 0) {
    return sourceCanvas;
  }

  const trimmedWidth = maxX - minX + 1;
  const trimmedHeight = maxY - minY + 1;
  const trimmedCanvas = document.createElement("canvas");

  trimmedCanvas.width = trimmedWidth;
  trimmedCanvas.height = trimmedHeight;

  const trimmedContext = trimmedCanvas.getContext("2d");
  if (!trimmedContext) {
    return sourceCanvas;
  }

  trimmedContext.drawImage(
    sourceCanvas,
    minX,
    minY,
    trimmedWidth,
    trimmedHeight,
    0,
    0,
    trimmedWidth,
    trimmedHeight
  );

  return trimmedCanvas;
}

function getDragKey(kind, blockId) {
  return blockId ? `${kind}-${blockId}` : kind;
}

function createDefaultTemplate(serviceKey = DEFAULT_SERVICE_KEY) {
  const preset = getServiceLayoutPreset(serviceKey);
  const defaultPage = getPageConfig(preset?.pageSize || DEFAULT_PAGE_SIZE);

  return {
    themeKey: DEFAULT_CERTIFICATE_THEME_KEY,
    pageSize: defaultPage.value,
    fontFamily: preset?.fontFamily || DEFAULT_FONT_KEY,
    logoSrc: "",
    logoBlock: {
      x: Math.round((defaultPage.width - LOGO_SIZE) / 2),
      y: 72,
      size: LOGO_SIZE,
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
    textBlocks: createGuideTextBlocks(defaultPage),
    signatureBlocks: createGuideSignatureBlocks(defaultPage),
  };
}

function isKnownServiceKey(value) {
  return SERVICE_OPTIONS.some((option) => option.value === value);
}

function getServiceLabel(serviceKey) {
  return SERVICE_OPTIONS.find((option) => option.value === serviceKey)?.label || "Certificate";
}

function clampNumber(value, min, max, fallback) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(max, Math.max(min, numericValue));
}

function normalizeColor(value, fallback) {
  const raw = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  return fallback;
}

function generateCertificate(template, serviceKey = DEFAULT_SERVICE_KEY) {
  const defaults = createDefaultTemplate(serviceKey);
  const normalizedTemplate = applyServiceLayoutPreset(template && typeof template === "object" ? template : {}, serviceKey);
  const pageConfig = getPageConfig(normalizedTemplate?.pageSize || defaults.pageSize);
  const fontConfig = getFontConfig(normalizedTemplate?.fontFamily || defaults.fontFamily);
  const themeConfig = getCertificateThemeConfig(normalizedTemplate?.themeKey || defaults.themeKey);
  const logoBlock = normalizedTemplate?.logoBlock || {};
  const block = normalizedTemplate?.contentBlock || {};
  const pageWidth = pageConfig.width;
  const pageHeight = pageConfig.height;
  const logoSize = clampNumber(logoBlock.size, 72, 180, defaults.logoBlock.size);
  const contentMaxWidth = Math.max(180, pageWidth - HORIZONTAL_ALIGNMENT_GUTTER * 2);
  const contentWidth = clampNumber(block.width, 180, contentMaxWidth, defaults.contentBlock.width);
  const contentXBounds = getCanvasAxisBounds(contentWidth, pageWidth, HORIZONTAL_ALIGNMENT_GUTTER);
  const contentYBounds = getCanvasAxisBounds(40, pageHeight, VERTICAL_DRAG_GUTTER);
  const textBlocks = Array.isArray(normalizedTemplate?.textBlocks)
    ? normalizedTemplate.textBlocks
    : normalizedTemplate?.extraTextBlock?.enabled
      ? [normalizedTemplate.extraTextBlock]
      : [];
  const signatureBlocks = Array.isArray(normalizedTemplate?.signatureBlocks)
    ? normalizedTemplate.signatureBlocks
    : normalizedTemplate?.signatureBlock
      ? normalizedTemplate.signatureBlock.enabled === false
        ? []
        : [normalizedTemplate.signatureBlock]
      : defaults.signatureBlocks;

  return {
    themeKey: themeConfig.value,
    pageSize: pageConfig.value,
    fontFamily: fontConfig.value,
    logoSrc: typeof normalizedTemplate?.logoSrc === "string" ? normalizedTemplate.logoSrc : defaults.logoSrc,
    logoBlock: {
      x: clampNumber(logoBlock.x, 0, pageWidth - logoSize, defaults.logoBlock.x),
      y: clampNumber(logoBlock.y, 0, pageHeight - logoSize, defaults.logoBlock.y),
      size: logoSize,
    },
    contentBlock: {
      x: clampNumber(block.x, contentXBounds.min, contentXBounds.max, defaults.contentBlock.x),
      y: clampNumber(block.y, contentYBounds.min, contentYBounds.max, defaults.contentBlock.y),
      width: contentWidth,
      text: String(block.text ?? defaults.contentBlock.text),
      fontSize: clampNumber(block.fontSize, 14, 64, defaults.contentBlock.fontSize),
      bold: Boolean(block.bold),
      align: normalizeAlignment(block.align, defaults.contentBlock.align),
      color: normalizeColor(block.color, defaults.contentBlock.color),
    },
    textBlocks: textBlocks.map((item) => normalizeAddedText(item, pageConfig)),
    signatureBlocks: signatureBlocks.map((item) => normalizeSignatureLine(item, pageConfig)),
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

function normalizeStoredTemplate(template, serviceKey = DEFAULT_SERVICE_KEY) {
  return generateCertificate(sanitizeLegacyTemplate(template), serviceKey);
}

function normalizeStoredTemplateEntry(entry, index = 0) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const serviceKey = isKnownServiceKey(entry.serviceKey) ? entry.serviceKey : DEFAULT_SERVICE_KEY;
  const normalizedTemplate = normalizeStoredTemplate(entry.template, serviceKey);

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

    const normalizedTemplate = normalizeStoredTemplate(templates[option.value], option.value);

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

function getDraftTemplate(savedTemplates, activeTemplateId, selectedService) {
  const activeTemplate = savedTemplates.find((entry) => entry.id === activeTemplateId);

  if (activeTemplate) {
    return activeTemplate.template;
  }

  return createDefaultTemplate(selectedService);
}

function parseStoredTemplateState(rawValue) {
  if (!rawValue) {
    return {
      selectedService: DEFAULT_SERVICE_KEY,
      activeTemplateId: null,
      selectedTemplateIds: [],
      savedTemplates: [],
      currentTemplate: createDefaultTemplate(DEFAULT_SERVICE_KEY),
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
      currentTemplate: getDraftTemplate(savedTemplates, activeTemplate?.id || null, fallbackService),
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
    const selectedService = activeTemplate?.serviceKey || DEFAULT_SERVICE_KEY;

    return {
      selectedService,
      activeTemplateId: activeTemplate?.id || null,
      selectedTemplateIds: getSelectedTemplateIds(rawSelectedTemplateIds, savedTemplates, activeTemplate?.id || null, {
        allowEmpty: Array.isArray(parsed.selectedServices),
      }),
      savedTemplates,
      currentTemplate: getDraftTemplate(savedTemplates, activeTemplate?.id || null, selectedService),
      shouldMigrate: true,
    };
  }

  const normalizedTemplate = normalizeStoredTemplate(parsed, DEFAULT_SERVICE_KEY);
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
    currentTemplate: savedTemplates[0]?.template || createDefaultTemplate(DEFAULT_SERVICE_KEY),
    shouldMigrate: savedTemplates.length > 0,
  };
}

function parseRemoteTemplateState(rawState) {
  return parseStoredTemplateState(JSON.stringify(rawState ?? null));
}

function CertificatePrintOutput({ certificate }) {
  const themeConfig = getCertificateThemeConfig(certificate?.themeKey);
  const pageConfig = getPageConfig(certificate?.pageSize);
  const fontConfig = getFontConfig(certificate?.fontFamily);
  const pageWidth = pageConfig.width;
  const pageHeight = pageConfig.height;
  const hasLogo = Boolean(certificate?.logoSrc);
  const hasMainContent = Boolean(String(certificate?.contentBlock?.text || "").trim());
  const logoStyle = {
    left: `${certificate.logoBlock.x}px`,
    top: `${certificate.logoBlock.y}px`,
    width: `${certificate.logoBlock.size}px`,
    height: `${certificate.logoBlock.size}px`,
  };
  const contentStyle = {
    left: `${certificate.contentBlock.x}px`,
    top: `${certificate.contentBlock.y}px`,
    width: `${certificate.contentBlock.width}px`,
    boxSizing: "border-box",
    fontSize: `${certificate.contentBlock.fontSize}px`,
    fontWeight: certificate.contentBlock.bold ? 700 : 400,
    textAlign: certificate.contentBlock.align || undefined,
    color: certificate.contentBlock.color,
    fontFamily: fontConfig.family,
  };
  const getTextBlockStyle = (block) => ({
    left: `${block.x}px`,
    top: `${block.y}px`,
    width: `${block.width}px`,
    boxSizing: "border-box",
    fontSize: `${block.fontSize}px`,
    fontWeight: block.bold ? 700 : 400,
    textAlign: block.align || undefined,
    color: block.color,
    fontFamily: fontConfig.family,
  });
  const getSignatureStyle = (block) => ({
    left: `${block.x}px`,
    top: `${block.y}px`,
    width: `${block.width}px`,
    boxSizing: "border-box",
    fontSize: `${block.fontSize}px`,
    color: block.color,
    fontFamily: fontConfig.family,
  });

  return (
    <div className="certificate-print-root" style={{ display: "none" }}>
      <div className="certificate-print-page bg-white">
        <div
          className="certificate-print-sheet relative overflow-hidden"
          style={{
            ...getCertificateThemeShellStyle(themeConfig.value),
            width: `${pageWidth}px`,
            height: `${pageHeight}px`,
            margin: "0 auto",
          }}
        >
          <CertificateThemeLayers themeKey={themeConfig.value} />
          {hasLogo ? (
            <div
              className="absolute z-20 grid place-items-center overflow-hidden rounded-full"
              style={{
                ...logoStyle,
                ...getCertificateThemeLogoStyle(themeConfig.value),
              }}
            >
              <img
                src={certificate.logoSrc}
                alt="Certificate logo"
                className="h-full w-full rounded-full object-cover"
                draggable={false}
              />
            </div>
          ) : null}

          {hasMainContent ? (
            <div
              className="absolute z-10 whitespace-pre-wrap break-words font-sans leading-[1.55]"
              style={contentStyle}
            >
              {certificate.contentBlock.text}
            </div>
          ) : null}

          {certificate.textBlocks.map((block) => (
            <div
              key={block.id}
              className="absolute z-10 whitespace-pre-wrap break-words font-sans leading-[1.45]"
              style={getTextBlockStyle(block)}
            >
              {block.text}
            </div>
          ))}

          {certificate.signatureBlocks.map((block) => {
            const signatureLabelParts = getSignatureLabelParts(block.label);
            const signatureImageBottomOffset = getSignatureImageBottomOffset(block, signatureLabelParts.topText);

            return (
              <div key={block.id} className="absolute z-10 text-center font-sans" style={getSignatureStyle(block)}>
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
                <div className="h-px" style={{ backgroundColor: block.color }} />
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
  );
}

export default function EditCertificate() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { permissions } = useModulePermissions();
  const certificateWorkspaceBasePath = useMemo(
    () => getCertificateWorkspaceBasePath(location.pathname),
    [location.pathname]
  );
  const canAccessHeaderToolsAndProperties = hasFeatureActionAccess(
    user,
    "edit-certificate",
    "header-tools-properties",
    permissions
  );
  const [selectedService, setSelectedService] = useState(DEFAULT_SERVICE_KEY);
  const [activeTemplateId, setActiveTemplateId] = useState(null);
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [template, setTemplateDraft] = useState(() => createDefaultTemplate(DEFAULT_SERVICE_KEY));
  const fileInputRef = useRef(null);
  const inlineEditorRef = useRef(null);
  const printContentRef = useRef(null);
  const previewViewportRef = useRef(null);
  const signaturePadRef = useRef(null);
  const signaturePadShellRef = useRef(null);
  const sheetRef = useRef(null);
  const placeholderToolbarRef = useRef(null);
  const certificateRef = useRef(generateCertificate(createDefaultTemplate()));
  const dragStateRef = useRef(null);
  const preserveInlineEditorRef = useRef(false);
  const placeholderTargetRef = useRef(null);
  const richTextEditorsRef = useRef({});
  const inlineEditorBlurFrameRef = useRef(0);
  const inlineEditorFocusFrameRef = useRef(0);
  const previewScaleRef = useRef(1);
  const [previewScale, setPreviewScale] = useState(1);
  const [selectedPlaceholderToken, setSelectedPlaceholderToken] = useState(PLACEHOLDER_DROPDOWN_OPTIONS[0] || "");
  const [dragTarget, setDragTarget] = useState(null);
  const [editingTarget, setEditingTarget] = useState(null);
  const [editingBounds, setEditingBounds] = useState(null);
  const [signaturePadTargetId, setSignaturePadTargetId] = useState(null);
  const [signaturePadWidth, setSignaturePadWidth] = useState(720);
  const serviceLayoutPreset = getServiceLayoutPreset(selectedService);
  const selectedServiceLabel = getServiceLabel(selectedService);
  const reusableLogoAssets = useMemo(() => collectReusableLogoAssets(savedTemplates), [savedTemplates]);
  const reusableSignatureAssets = useMemo(() => collectReusableSignatureAssets(savedTemplates), [savedTemplates]);

  const setTemplate = useCallback((updater) => {
    setTemplateDraft((currentTemplate) => {
      const nextTemplate = typeof updater === "function" ? updater(currentTemplate) : updater;

      if (!nextTemplate || nextTemplate === currentTemplate) {
        return currentTemplate;
      }

      return nextTemplate;
    });
  }, []);

  const registerRichTextEditor = useCallback((editorKey, editor) => {
    if (!editorKey) {
      return;
    }

    richTextEditorsRef.current[editorKey] = editor;
  }, []);

  const unregisterRichTextEditor = useCallback((editorKey) => {
    if (!editorKey) {
      return;
    }

    delete richTextEditorsRef.current[editorKey];
  }, []);

  const rememberRichTextEditorTarget = useCallback((editorKey, editorInstance = null) => {
    const selectionFrom =
      typeof editorInstance?.state?.selection?.from === "number"
        ? editorInstance.state.selection.from
        : null;
    const selectionTo =
      typeof editorInstance?.state?.selection?.to === "number"
        ? editorInstance.state.selection.to
        : selectionFrom;

    if (editorKey === "content") {
      placeholderTargetRef.current = {
        kind: "content",
        editorType: "tiptap",
        editorKey,
        selectionFrom,
        selectionTo,
      };
      return;
    }

    if (String(editorKey || "").startsWith("text:")) {
      placeholderTargetRef.current = {
        kind: "text",
        blockId: String(editorKey).slice(5),
        editorType: "tiptap",
        editorKey,
        selectionFrom,
        selectionTo,
      };
      return;
    }

    if (String(editorKey || "").startsWith("signature:")) {
      placeholderTargetRef.current = {
        kind: "signature",
        blockId: String(editorKey).slice(10),
        editorType: "tiptap",
        editorKey,
        selectionFrom,
        selectionTo,
      };
    }
  }, []);

  const rememberPlaceholderTarget = useCallback((meta, event) => {
    const target = event.currentTarget;
    const value = String(target?.value ?? "");
    const selectionStart =
      typeof target?.selectionStart === "number" ? target.selectionStart : value.length;
    const selectionEnd =
      typeof target?.selectionEnd === "number" ? target.selectionEnd : selectionStart;

    placeholderTargetRef.current = {
      ...meta,
      selectionStart,
      selectionEnd,
    };
  }, []);

  const createPlaceholderFieldBindings = useCallback(
    (meta) => ({
      onFocus: (event) => rememberPlaceholderTarget(meta, event),
      onClick: (event) => rememberPlaceholderTarget(meta, event),
      onKeyUp: (event) => rememberPlaceholderTarget(meta, event),
      onSelect: (event) => rememberPlaceholderTarget(meta, event),
    }),
    [rememberPlaceholderTarget]
  );

  const syncRichTextPlaceholderTargetSelection = useCallback(() => {
    const target = placeholderTargetRef.current;
    if (!target || target.editorType !== "tiptap" || !target.editorKey) {
      return;
    }

    const activeEditor = richTextEditorsRef.current[target.editorKey];
    if (!activeEditor) {
      return;
    }

    const selectionFrom =
      typeof activeEditor.state?.selection?.from === "number"
        ? activeEditor.state.selection.from
        : target.selectionFrom ?? null;
    const selectionTo =
      typeof activeEditor.state?.selection?.to === "number"
        ? activeEditor.state.selection.to
        : target.selectionTo ?? selectionFrom;

    placeholderTargetRef.current = {
      ...target,
      selectionFrom,
      selectionTo,
    };
  }, []);

  const cancelPendingInlineEditorBlur = useCallback(() => {
    if (typeof window === "undefined" || !inlineEditorBlurFrameRef.current) {
      return;
    }

    window.cancelAnimationFrame(inlineEditorBlurFrameRef.current);
    inlineEditorBlurFrameRef.current = 0;
  }, []);

  const cancelPendingInlineEditorFocus = useCallback(() => {
    if (typeof window === "undefined" || !inlineEditorFocusFrameRef.current) {
      return;
    }

    window.cancelAnimationFrame(inlineEditorFocusFrameRef.current);
    inlineEditorFocusFrameRef.current = 0;
  }, []);

  const clearDragState = useCallback((dragKey = null) => {
    if (!dragStateRef.current) return;
    if (dragKey && dragStateRef.current.dragKey !== dragKey) return;

    dragStateRef.current = null;
    setDragTarget(null);
  }, []);

  const focusInlineEditor = useCallback(
    (selectionStart = null, selectionEnd = null) => {
      if (typeof window === "undefined") {
        preserveInlineEditorRef.current = false;
        return;
      }

      cancelPendingInlineEditorFocus();

      // Let the double-click finish and the editor mount before restoring the caret.
      inlineEditorFocusFrameRef.current = window.requestAnimationFrame(() => {
        inlineEditorFocusFrameRef.current = window.requestAnimationFrame(() => {
          inlineEditorFocusFrameRef.current = 0;

          const editor = inlineEditorRef.current;
          if (!editor || !editingTarget) {
            preserveInlineEditorRef.current = false;
            return;
          }

          editor.focus({ preventScroll: true });

          if (typeof editor.setSelectionRange === "function") {
            const valueLength = String(editor.value || "").length;
            const nextStart =
              typeof selectionStart === "number" ? Math.min(Math.max(selectionStart, 0), valueLength) : valueLength;
            const nextEnd =
              typeof selectionEnd === "number" ? Math.min(Math.max(selectionEnd, nextStart), valueLength) : nextStart;
            editor.setSelectionRange(nextStart, nextEnd);
          }

          preserveInlineEditorRef.current = false;
        });
      });
    },
    [cancelPendingInlineEditorFocus, editingTarget]
  );

  const stopInlineEditing = useCallback(() => {
    cancelPendingInlineEditorBlur();
    cancelPendingInlineEditorFocus();
    setEditingTarget(null);
    setEditingBounds(null);
  }, [cancelPendingInlineEditorBlur, cancelPendingInlineEditorFocus]);

  const restoreInlineEditorFocus = useCallback(() => {
    const selectionStart = placeholderTargetRef.current?.selectionStart;
    const selectionEnd =
      typeof placeholderTargetRef.current?.selectionEnd === "number"
        ? placeholderTargetRef.current.selectionEnd
        : selectionStart;

    focusInlineEditor(selectionStart, selectionEnd);
  }, [focusInlineEditor]);

  const beginPlaceholderToolbarInteraction = useCallback(() => {
    syncRichTextPlaceholderTargetSelection();

    if (!editingTarget) {
      return;
    }

    preserveInlineEditorRef.current = true;
  }, [editingTarget, syncRichTextPlaceholderTargetSelection]);

  const endPlaceholderToolbarInteraction = useCallback(() => {
    preserveInlineEditorRef.current = false;
  }, []);

  const clearActiveCertificateEditorTarget = () => {
    clearDragState();
    stopInlineEditing();
    endPlaceholderToolbarInteraction();
    placeholderTargetRef.current = null;
  };

  const handleInlineEditorBlur = useCallback((event) => {
    const nextTarget = event.relatedTarget;

    if (
      preserveInlineEditorRef.current ||
      (nextTarget instanceof HTMLElement && placeholderToolbarRef.current?.contains(nextTarget))
    ) {
      return;
    }

    cancelPendingInlineEditorBlur();

    if (typeof window === "undefined") {
      stopInlineEditing();
      return;
    }

    inlineEditorBlurFrameRef.current = window.requestAnimationFrame(() => {
      inlineEditorBlurFrameRef.current = 0;

      const activeElement = document.activeElement;
      if (
        preserveInlineEditorRef.current ||
        (activeElement instanceof HTMLElement && placeholderToolbarRef.current?.contains(activeElement)) ||
        activeElement === inlineEditorRef.current
      ) {
        return;
      }

      stopInlineEditing();
    });
  }, [cancelPendingInlineEditorBlur, stopInlineEditing]);

  const handleAddPlaceholder = () => {
    syncRichTextPlaceholderTargetSelection();

    const placeholder = String(selectedPlaceholderToken || "").trim();
    const target = placeholderTargetRef.current;

    endPlaceholderToolbarInteraction();

    if (!placeholder) {
      showInfoToast("Choose a placeholder first, then click Add.");
      return;
    }

    if (!target) {
      showInfoToast("Click a text or signature field first, then add the placeholder.");
      return;
    }
    const isTargetAvailable =
      target.kind === "content" ||
      (target.kind === "text" && template.textBlocks.some((block) => block.id === target.blockId)) ||
      (target.kind === "signature" && template.signatureBlocks.some((block) => block.id === target.blockId));

    if (!isTargetAvailable) {
      showInfoToast("Select a valid certificate field first, then add the placeholder.");
      return;
    }

    if (target.editorType === "tiptap") {
      const activeEditor = richTextEditorsRef.current[target.editorKey];
      if (!activeEditor) {
        showInfoToast("Click a text field first, then add the placeholder.");
        return;
      }

      const chain = activeEditor.chain().focus();
      if (typeof target.selectionFrom === "number") {
        chain.setTextSelection({
          from: target.selectionFrom,
          to: typeof target.selectionTo === "number" ? target.selectionTo : target.selectionFrom,
        });
      }
      chain.insertContent(placeholder).run();

      const nextSelectionFrom =
        typeof activeEditor.state?.selection?.from === "number"
          ? activeEditor.state.selection.from
          : null;
      const nextSelectionTo =
        typeof activeEditor.state?.selection?.to === "number"
          ? activeEditor.state.selection.to
          : nextSelectionFrom;

      placeholderTargetRef.current = {
        ...target,
        selectionFrom: nextSelectionFrom,
        selectionTo: nextSelectionTo,
      };
      return;
    }

    setTemplate((current) => {
      const applyInsertion = (currentValue) =>
        insertPlaceholderAtSelection(currentValue, placeholder, target.selectionStart, target.selectionEnd);

      if (target.kind === "content") {
        const insertion = applyInsertion(current.contentBlock?.text);
        placeholderTargetRef.current = {
          ...target,
          selectionStart: insertion.caretPosition,
          selectionEnd: insertion.caretPosition,
        };

        return {
          ...current,
          contentBlock: {
            ...current.contentBlock,
            text: insertion.value,
          },
        };
      }

      if (target.kind === "text") {
        const targetExists = current.textBlocks.some((block) => block.id === target.blockId);
        if (!targetExists) {
          return current;
        }

        return {
          ...current,
          textBlocks: current.textBlocks.map((block) => {
            if (block.id !== target.blockId) {
              return block;
            }

            const insertion = applyInsertion(block.text);
            placeholderTargetRef.current = {
              ...target,
              selectionStart: insertion.caretPosition,
              selectionEnd: insertion.caretPosition,
            };

            return {
              ...block,
              text: insertion.value,
            };
          }),
        };
      }

      if (target.kind === "signature") {
        const targetExists = current.signatureBlocks.some((block) => block.id === target.blockId);
        if (!targetExists) {
          return current;
        }

        return {
          ...current,
          signatureBlocks: current.signatureBlocks.map((block) => {
            if (block.id !== target.blockId) {
              return block;
            }

            const insertion = applyInsertion(block.label);
            placeholderTargetRef.current = {
              ...target,
              selectionStart: insertion.caretPosition,
              selectionEnd: insertion.caretPosition,
            };

            return {
              ...block,
              label: insertion.value,
            };
          }),
        };
      }

      return current;
    });

    if (editingTarget) {
      restoreInlineEditorFocus();
    }
  };

  useEffect(() => {
    let isCancelled = false;

    const hydrateTemplate = async () => {
      try {
        const response = await fetchCertificateTemplates();
        const parsedState = parseRemoteTemplateState(response?.data?.state);
        const templateIdFromQuery = new URLSearchParams(location.search).get("template");
        const targetTemplate = templateIdFromQuery
          ? parsedState.savedTemplates.find((entry) => entry.id === templateIdFromQuery) || null
          : null;

        if (isCancelled) return;

        if (targetTemplate) {
          setSavedTemplates(parsedState.savedTemplates);
          setSelectedService(targetTemplate.serviceKey);
          setActiveTemplateId(targetTemplate.id);
          setTemplateDraft(targetTemplate.template);
          return;
        }

        setSavedTemplates(parsedState.savedTemplates);
        setSelectedService(DEFAULT_SERVICE_KEY);
        setActiveTemplateId(null);
        setTemplateDraft(createDefaultTemplate(DEFAULT_SERVICE_KEY));
      } catch (_) {
        if (!isCancelled) {
          showErrorToast("Certificate template could not be loaded.");
        }
      }
    };

    hydrateTemplate();

    return () => {
      isCancelled = true;
    };
  }, [location.search]);

  const certificate = useMemo(() => generateCertificate(template, selectedService), [selectedService, template]);
  const signaturePadBlock = useMemo(
    () => certificate.signatureBlocks.find((block) => block.id === signaturePadTargetId) || null,
    [certificate.signatureBlocks, signaturePadTargetId]
  );
  const pageConfig = getPageConfig(certificate.pageSize);
  const fontConfig = getFontConfig(certificate.fontFamily);
  const themeConfig = getCertificateThemeConfig(certificate.themeKey);
  const pageWidth = pageConfig.width;
  const pageHeight = pageConfig.height;
  const logoHorizontalBounds = getCanvasAxisBounds(certificate.logoBlock.size, pageWidth, HORIZONTAL_ALIGNMENT_GUTTER);
  const logoVerticalBounds = getCanvasAxisBounds(certificate.logoBlock.size, pageHeight, VERTICAL_DRAG_GUTTER);
  const themeBadgeStyle = getCertificateThemeBadgeStyle(certificate.themeKey);
  certificateRef.current = certificate;
  previewScaleRef.current = previewScale;

  useEffect(() => {
    const viewport = previewViewportRef.current;
    if (!viewport || typeof window === "undefined") return undefined;

    const updateScale = () => {
      const viewportStyles = window.getComputedStyle(viewport);
      const horizontalPadding =
        Number.parseFloat(viewportStyles.paddingLeft || "0") +
        Number.parseFloat(viewportStyles.paddingRight || "0");
      const availableWidth = Math.max(0, viewport.clientWidth - horizontalPadding);
      const nextScale = Number(Math.min(1, availableWidth / pageWidth).toFixed(4));

      setPreviewScale((current) => (current === nextScale ? current : nextScale));
    };

    updateScale();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateScale);
      return () => window.removeEventListener("resize", updateScale);
    }

    const resizeObserver = new ResizeObserver(updateScale);
    resizeObserver.observe(viewport);

    return () => {
      resizeObserver.disconnect();
    };
  }, [pageWidth]);

  useEffect(() => {
    if (!signaturePadTargetId || typeof window === "undefined") return undefined;

    const shell = signaturePadShellRef.current;
    if (!shell) return undefined;

    const updatePadWidth = () => {
      const nextWidth = clampNumber(Math.floor(shell.clientWidth || 0), 280, 760, 720);
      setSignaturePadWidth((current) => (current === nextWidth ? current : nextWidth));
    };

    updatePadWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updatePadWidth);
      return () => window.removeEventListener("resize", updatePadWidth);
    }

    const resizeObserver = new ResizeObserver(updatePadWidth);
    resizeObserver.observe(shell);

    return () => {
      resizeObserver.disconnect();
    };
  }, [signaturePadTargetId]);

  useEffect(() => {
    if (!signaturePadTargetId || !signaturePadRef.current || typeof window === "undefined") return undefined;

    const frame = window.requestAnimationFrame(() => {
      const pad = signaturePadRef.current;
      if (!pad) return;

      pad.clear();

      if (signaturePadBlock?.signatureSrc) {
        try {
          pad.fromDataURL(signaturePadBlock.signatureSrc);
        } catch (_) {
          showErrorToast("Saved signature drawing could not be restored in the editor.");
        }
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [signaturePadBlock?.signatureSrc, signaturePadTargetId, signaturePadWidth]);

  useEffect(() => {
    if (signaturePadTargetId && !signaturePadBlock) {
      setSignaturePadTargetId(null);
    }
  }, [signaturePadBlock, signaturePadTargetId]);

  const updateLayoutSetting = (field, value) => {
    if ((field === "fontFamily" && serviceLayoutPreset?.fontFamily) || (field === "pageSize" && serviceLayoutPreset?.pageSize)) {
      return;
    }

    setTemplate((current) =>
      generateCertificate(
        {
          ...current,
          [field]: value,
        },
        selectedService
      )
    );
  };

  const updateBlock = (field, value) => {
    setTemplate((current) => ({
      ...current,
      contentBlock: {
        ...current.contentBlock,
        [field]: value,
      },
    }));
  };

  const updateTextBlock = (blockId, field, value) => {
    setTemplate((current) => ({
      ...current,
      textBlocks: current.textBlocks.map((block) =>
        block.id === blockId
          ? {
              ...block,
              [field]: value,
            }
          : block
      ),
    }));
  };

  const updateSignatureLine = (blockId, field, value) => {
    setTemplate((current) => ({
      ...current,
      signatureBlocks: current.signatureBlocks.map((block) =>
        block.id === blockId
          ? {
              ...block,
              [field]: value,
            }
          : block
      ),
    }));
  };

  const updateLogoBlock = (field, value) => {
    setTemplate((current) => ({
      ...current,
      logoBlock: {
        ...current.logoBlock,
        [field]: value,
      },
    }));
  };

  const alignLogoHorizontally = (alignment) => {
    const nextX = getAlignedCanvasX(alignment, certificate.logoBlock.size, pageWidth);

    updateLogoBlock("x", nextX);
  };

  const alignSignatureHorizontally = (blockId, alignment) => {
    const activeSignature = certificate.signatureBlocks.find((block) => block.id === blockId);
    if (!activeSignature) {
      return;
    }

    const nextX = getAlignedCanvasX(alignment, activeSignature.width, pageWidth);

    updateSignatureLine(blockId, "x", nextX);
  };

  const startInlineEditing = (kind, blockId = null) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    cancelPendingInlineEditorBlur();
    clearDragState();
    if (kind === "text" && blockId) {
      setTemplate((current) => {
        const blockIndex = current.textBlocks.findIndex((block) => block.id === blockId);
        if (blockIndex < 0) return current;

        const activeBlock = current.textBlocks[blockIndex];
        if (String(activeBlock.text || "").trim()) return current;

        return {
          ...current,
          textBlocks: current.textBlocks.map((block, index) =>
            block.id === blockId
              ? {
                  ...block,
                  text: getDefaultAddedTextLabel(index),
                }
              : block
          ),
        };
      });
    }
    setEditingBounds({
      width: event.currentTarget.offsetWidth || null,
      height: event.currentTarget.offsetHeight || null,
    });
    setEditingTarget(getDragKey(kind, blockId));
  };

  const isEditingBlock = (kind, blockId = null) => editingTarget === getDragKey(kind, blockId);

  const addTextBlock = () => {
    setTemplate((current) => {
      const blockCount = current.textBlocks.length;

      return {
        ...current,
        textBlocks: [
          ...current.textBlocks,
          createDefaultAddedText({
            text: getDefaultAddedTextLabel(blockCount),
            x: 120,
            y: clampNumber(
              720 + blockCount * 70,
              getCanvasAxisBounds(40, pageHeight, VERTICAL_DRAG_GUTTER).min,
              getCanvasAxisBounds(40, pageHeight, VERTICAL_DRAG_GUTTER).max,
              720
            ),
            align: "",
          }),
        ],
      };
    });
  };

  const removeTextBlock = (blockId) => {
    clearDragState(getDragKey("text", blockId));
    setTemplate((current) => ({
      ...current,
      textBlocks: current.textBlocks.filter((block) => block.id !== blockId),
    }));
  };

  const addSignatureLine = () => {
    setTemplate((current) => {
      const lineCount = current.signatureBlocks.length;

      return {
        ...current,
        signatureBlocks: [
          ...current.signatureBlocks,
          createDefaultSignatureLine({
            x: clampNumber(
              92 + lineCount * 240,
              getCanvasAxisBounds(140, pageWidth, HORIZONTAL_ALIGNMENT_GUTTER).min,
              getCanvasAxisBounds(140, pageWidth, HORIZONTAL_ALIGNMENT_GUTTER).max,
              92
            ),
            y: clampNumber(
              pageHeight - 160,
              getCanvasAxisBounds(50, pageHeight, VERTICAL_DRAG_GUTTER).min,
              getCanvasAxisBounds(50, pageHeight, VERTICAL_DRAG_GUTTER).max,
              865
            ),
          }),
        ],
      };
    });
  };

  const removeSignatureLine = (blockId) => {
    clearDragState(getDragKey("signature", blockId));
    setTemplate((current) => ({
      ...current,
      signatureBlocks: current.signatureBlocks.filter((block) => block.id !== blockId),
    }));
  };

  const openSignaturePad = (blockId) => {
    clearDragState(getDragKey("signature", blockId));
    stopInlineEditing();
    setSignaturePadTargetId(blockId);
  };

  const closeSignaturePad = () => {
    setSignaturePadTargetId(null);
  };

  const clearSavedSignature = (blockId) => {
    setTemplate((current) => ({
      ...current,
      signatureBlocks: current.signatureBlocks.map((block) =>
        block.id === blockId
          ? {
              ...block,
              signatureSrc: "",
            }
          : block
      ),
    }));
  };

  const clearSignaturePad = () => {
    signaturePadRef.current?.clear();
  };

  const saveSignaturePad = () => {
    const pad = signaturePadRef.current;
    if (!pad || !signaturePadTargetId) return;

    if (pad.isEmpty()) {
      showErrorToast("Please draw a signature before saving.");
      return;
    }

    const signatureCanvas = typeof pad.getCanvas === "function" ? pad.getCanvas() : null;
    const trimmedCanvas = trimSignatureCanvas(signatureCanvas);

    if (!trimmedCanvas || typeof trimmedCanvas.toDataURL !== "function") {
      showErrorToast("Signature drawing could not be saved.");
      return;
    }

    const signatureSrc = trimmedCanvas.toDataURL("image/png");
    updateSignatureLine(signaturePadTargetId, "signatureSrc", signatureSrc);
    setSignaturePadTargetId(null);
    showSuccessToast("Signature drawing saved.");
  };

  const applyReusableLogo = useCallback((logoSrc) => {
    const normalizedLogoSrc = String(logoSrc || "").trim();
    if (!normalizedLogoSrc) {
      return;
    }

    setTemplate((current) => ({
      ...current,
      logoSrc: normalizedLogoSrc,
    }));
    showSuccessToast("Saved logo applied.");
  }, [setTemplate]);

  const applyReusableSignature = useCallback((blockId, signatureSrc) => {
    const normalizedSignatureSrc = String(signatureSrc || "").trim();
    if (!blockId || !normalizedSignatureSrc) {
      return;
    }

    updateSignatureLine(blockId, "signatureSrc", normalizedSignatureSrc);
    showSuccessToast("Saved signature applied.");
  }, [updateSignatureLine]);

  useEffect(() => {
    if (!editingTarget) return undefined;

    const activePlaceholderTarget = placeholderTargetRef.current;
    const activePlaceholderKey = activePlaceholderTarget
      ? getDragKey(activePlaceholderTarget.kind, activePlaceholderTarget.blockId ?? null)
      : null;
    const selectionStart =
      activePlaceholderKey === editingTarget ? activePlaceholderTarget?.selectionStart ?? null : null;
    const selectionEnd =
      activePlaceholderKey === editingTarget && typeof activePlaceholderTarget?.selectionEnd === "number"
        ? activePlaceholderTarget.selectionEnd
        : selectionStart;

    focusInlineEditor(selectionStart, selectionEnd);

    return () => {
      cancelPendingInlineEditorFocus();
    };
  }, [cancelPendingInlineEditorFocus, editingTarget, focusInlineEditor]);

  useEffect(() => {
    const editor = inlineEditorRef.current;
    if (!editingTarget || !editor) return;

    editor.style.height = "auto";
    editor.style.height = `${Math.max(editingBounds?.height || 0, editor.scrollHeight)}px`;
  }, [editingBounds, editingTarget, template.contentBlock.text, template.textBlocks]);

  useEffect(
    () => () => {
      cancelPendingInlineEditorBlur();
      cancelPendingInlineEditorFocus();
    },
    [cancelPendingInlineEditorBlur, cancelPendingInlineEditorFocus]
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handlePointerMove = (event) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId || !sheetRef.current) {
        return;
      }

      const scale = previewScaleRef.current || 1;
      const currentCertificate = certificateRef.current;
      const currentPageConfig = getPageConfig(currentCertificate.pageSize);
      const currentPageWidth = currentPageConfig.width;
      const currentPageHeight = currentPageConfig.height;
      const sheetRect = sheetRef.current.getBoundingClientRect();
      const rawX = Math.round((event.clientX - sheetRect.left) / scale - dragState.offsetX);
      const rawY = Math.round((event.clientY - sheetRect.top) / scale - dragState.offsetY);
      const targetNode = sheetRef.current.querySelector(`[data-drag-key="${dragState.dragKey}"]`);

      if (dragState.kind === "logo") {
        const logoXBounds = getCanvasAxisBounds(
          currentCertificate.logoBlock.size,
          currentPageWidth,
          HORIZONTAL_ALIGNMENT_GUTTER
        );
        const logoYBounds = getCanvasAxisBounds(
          currentCertificate.logoBlock.size,
          currentPageHeight,
          VERTICAL_DRAG_GUTTER
        );

        setTemplate((current) => ({
          ...current,
          logoBlock: {
            ...current.logoBlock,
            x: clampNumber(rawX, logoXBounds.min, logoXBounds.max, currentCertificate.logoBlock.x),
            y: clampNumber(rawY, logoYBounds.min, logoYBounds.max, currentCertificate.logoBlock.y),
          },
        }));
        return;
      }

      if (dragState.kind === "content") {
        const contentHeight = targetNode?.offsetHeight || 0;
        const contentXBounds = getCanvasAxisBounds(
          currentCertificate.contentBlock.width,
          currentPageWidth,
          HORIZONTAL_ALIGNMENT_GUTTER
        );
        const contentYBounds = getCanvasAxisBounds(contentHeight, currentPageHeight, VERTICAL_DRAG_GUTTER);

        setTemplate((current) => ({
          ...current,
          contentBlock: {
            ...current.contentBlock,
            x: clampNumber(rawX, contentXBounds.min, contentXBounds.max, currentCertificate.contentBlock.x),
            y: clampNumber(rawY, contentYBounds.min, contentYBounds.max, currentCertificate.contentBlock.y),
          },
        }));
        return;
      }

      if (dragState.kind === "text") {
        const activeBlock = currentCertificate.textBlocks.find((block) => block.id === dragState.blockId);
        if (!activeBlock) {
          clearDragState();
          return;
        }

        const blockHeight = targetNode?.offsetHeight || 0;
        const textXBounds = getCanvasAxisBounds(activeBlock.width, currentPageWidth, HORIZONTAL_ALIGNMENT_GUTTER);
        const textYBounds = getCanvasAxisBounds(blockHeight, currentPageHeight, VERTICAL_DRAG_GUTTER);

        setTemplate((current) => ({
          ...current,
          textBlocks: current.textBlocks.map((block) =>
            block.id === dragState.blockId
              ? {
                  ...block,
                  x: clampNumber(rawX, textXBounds.min, textXBounds.max, activeBlock.x),
                  y: clampNumber(rawY, textYBounds.min, textYBounds.max, activeBlock.y),
                }
              : block
          ),
        }));
        return;
      }

      if (dragState.kind === "signature") {
        const activeBlock = currentCertificate.signatureBlocks.find((block) => block.id === dragState.blockId);
        if (!activeBlock) {
          clearDragState();
          return;
        }

        const blockHeight = targetNode?.offsetHeight || 0;
        const signatureXBounds = getCanvasAxisBounds(activeBlock.width, currentPageWidth, HORIZONTAL_ALIGNMENT_GUTTER);
        const signatureYBounds = getCanvasAxisBounds(blockHeight, currentPageHeight, VERTICAL_DRAG_GUTTER);

        setTemplate((current) => ({
          ...current,
          signatureBlocks: current.signatureBlocks.map((block) =>
            block.id === dragState.blockId
              ? {
                  ...block,
                  x: clampNumber(rawX, signatureXBounds.min, signatureXBounds.max, activeBlock.x),
                  y: clampNumber(rawY, signatureYBounds.min, signatureYBounds.max, activeBlock.y),
                }
              : block
          ),
        }));
        return;
      }

      clearDragState();
    };

    const stopDragging = () => {
      clearDragState();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [clearDragState, setTemplate]);

  const handleDragStart = (kind, blockId = null) => (event) => {
    if (editingTarget || !sheetRef.current) return;

    event.preventDefault();

    const targetNode = event.currentTarget;
    const scale = previewScaleRef.current || 1;
    const targetRect = targetNode.getBoundingClientRect();
    const dragKey = getDragKey(kind, blockId);

    dragStateRef.current = {
      kind,
      blockId,
      dragKey,
      pointerId: event.pointerId,
      offsetX: (event.clientX - targetRect.left) / scale,
      offsetY: (event.clientY - targetRect.top) / scale,
    };

    setDragTarget(dragKey);
  };

  const handleImageOnlyDragStart = (kind, blockId = null) => (event) => {
    const eventTarget = event.target;
    const isImageTarget =
      typeof window !== "undefined" &&
      eventTarget instanceof window.Element &&
      eventTarget.tagName.toLowerCase() === "img";

    if (!isImageTarget) {
      return;
    }

    handleDragStart(kind, blockId)(event);
  };

  const handleSave = async () => {
    closeSignaturePad();

    if (!hasMeaningfulCertificate(certificate)) {
      showInfoToast("Add certificate content first, then save the template.");
      return;
    }

    try {
      setIsSaving(true);
      await saveCertificateTemplate({
        template_id: activeTemplateId || undefined,
        service_key: selectedService,
        template: certificate,
      });
      showSuccessToast(`${selectedServiceLabel} certificate template saved.`);
      navigate(`${certificateWorkspaceBasePath}/certificate`);
    } catch (error) {
      showErrorToast(error?.response?.data?.message || "Certificate template could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    clearDragState();
    stopInlineEditing();
    closeSignaturePad();
    setActiveTemplateId(null);
    setTemplateDraft(createDefaultTemplate(selectedService));
    showInfoToast(`${selectedServiceLabel} editor reset. Save when you want to create this template.`);
  };

  const handleCreateNewTemplate = () => {
    clearDragState();
    stopInlineEditing();
    closeSignaturePad();
    setActiveTemplateId(null);
    setTemplateDraft(createDefaultTemplate(selectedService));
    showInfoToast("Guide template ready. You can adjust the placeholders, then save it as a new certificate.");
  };

  const handleUploadLogoClick = () => {
    fileInputRef.current?.click();
  };

  const handleLogoUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showErrorToast("Please upload an image file for the logo.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setTemplate((current) => ({
        ...current,
        logoSrc: String(reader.result || ""),
      }));
      showSuccessToast("Logo uploaded to the certificate preview.");
    };
    reader.onerror = () => showErrorToast("The selected logo could not be loaded.");
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handleRemoveLogo = () => {
    clearDragState(getDragKey("logo"));
    setTemplate((current) => ({
      ...current,
      logoSrc: "",
    }));
  };

  const handlePrintTest = useReactToPrint({
    contentRef: printContentRef,
    documentTitle: () => `certificate-output-${new Date().toISOString().slice(0, 10)}`,
    pageStyle: getPrintPageStyle(pageConfig),
    onPrintError: () => {
      showErrorToast("Certificate output could not be opened for printing.");
    },
  });

  const contentStyle = {
    left: `${certificate.contentBlock.x}px`,
    top: `${certificate.contentBlock.y}px`,
    width: `${certificate.contentBlock.width}px`,
    boxSizing: "border-box",
    fontSize: `${certificate.contentBlock.fontSize}px`,
    fontWeight: certificate.contentBlock.bold ? 700 : 400,
    textAlign: certificate.contentBlock.align,
    color: certificate.contentBlock.color,
    fontFamily: fontConfig.family,
  };
  const logoStyle = {
    left: `${certificate.logoBlock.x}px`,
    top: `${certificate.logoBlock.y}px`,
    width: `${certificate.logoBlock.size}px`,
    height: `${certificate.logoBlock.size}px`,
  };
  const hasLogo = Boolean(certificate.logoSrc);
  const hasMainContent = Boolean(String(certificate.contentBlock.text || "").trim());
  const getTextBlockStyle = (block) => ({
    left: `${block.x}px`,
    top: `${block.y}px`,
    width: `${block.width}px`,
    boxSizing: "border-box",
    fontSize: `${block.fontSize}px`,
    fontWeight: block.bold ? 700 : 400,
    textAlign: block.align,
    color: block.color,
    fontFamily: fontConfig.family,
  });
  const getSignatureStyle = (block) => ({
    left: `${block.x}px`,
    top: `${block.y}px`,
    width: `${block.width}px`,
    boxSizing: "border-box",
    fontSize: `${block.fontSize}px`,
    color: block.color,
    fontFamily: fontConfig.family,
  });

  return (
    <div className="space-y-6" id="certificate-editor-page">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleLogoUpload}
      />
      <div ref={printContentRef}>
        <CertificatePrintOutput certificate={certificate} />
      </div>

      {canAccessHeaderToolsAndProperties ? (
        <Card className="overflow-hidden border-slate-200/90 bg-white/95">
          <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-3">
                <div>
                  <div className={LABEL_CLASS}>Header Tools</div>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <label className="block rounded-2xl border border-slate-200 bg-white/80 px-3 py-3">
                      <span className={LABEL_CLASS}>Service</span>
                      <select
                        value={selectedService}
                        onMouseDown={clearActiveCertificateEditorTarget}
                        onChange={(event) => {
                          clearActiveCertificateEditorTarget();
                          setSelectedService(event.target.value);
                        }}
                        className={`${HEADER_SELECT_CLASS} mt-2 w-full`}
                      >
                        {SERVICE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block rounded-2xl border border-slate-200 bg-white/80 px-3 py-3">
                      <span className={LABEL_CLASS}>Font</span>
                      <select
                        value={template.fontFamily}
                        onMouseDown={clearActiveCertificateEditorTarget}
                        onChange={(event) => {
                          clearActiveCertificateEditorTarget();
                          updateLayoutSetting("fontFamily", event.target.value);
                        }}
                        className={`${HEADER_SELECT_CLASS} mt-2 w-full`}
                        disabled={Boolean(serviceLayoutPreset?.fontFamily)}
                      >
                        {FONT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block rounded-2xl border border-slate-200 bg-white/80 px-3 py-3">
                      <span className={LABEL_CLASS}>Page Size</span>
                      <select
                        value={template.pageSize}
                        onMouseDown={clearActiveCertificateEditorTarget}
                        onChange={(event) => {
                          clearActiveCertificateEditorTarget();
                          updateLayoutSetting("pageSize", event.target.value);
                        }}
                        className={`${HEADER_SELECT_CLASS} mt-2 w-full`}
                        disabled={Boolean(serviceLayoutPreset?.pageSize)}
                      >
                        {PAGE_SIZE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block rounded-2xl border border-slate-200 bg-white/80 px-3 py-3">
                      <span className={LABEL_CLASS}>Theme</span>
                      <select
                        value={template.themeKey || DEFAULT_CERTIFICATE_THEME_KEY}
                        onMouseDown={clearActiveCertificateEditorTarget}
                        onChange={(event) => {
                          clearActiveCertificateEditorTarget();
                          updateLayoutSetting("themeKey", event.target.value);
                        }}
                        className={`${HEADER_SELECT_CLASS} mt-2 w-full`}
                      >
                        {CERTIFICATE_THEME_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <div
                  ref={placeholderToolbarRef}
                  className="rounded-2xl border border-slate-200 bg-white/85 px-3 py-3"
                >
                  <div className={LABEL_CLASS}>Placeholders</div>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <label className="block flex-1">
                      <span className="text-sm font-medium text-slate-700">Token</span>
                      <select
                        value={selectedPlaceholderToken}
                        onMouseDown={beginPlaceholderToolbarInteraction}
                        onChange={(event) => {
                          setSelectedPlaceholderToken(event.target.value);
                        }}
                        onBlur={(event) => {
                          const nextTarget = event.relatedTarget;
                          if (
                            nextTarget instanceof HTMLElement &&
                            placeholderToolbarRef.current?.contains(nextTarget)
                          ) {
                            return;
                          }

                          endPlaceholderToolbarInteraction();
                        }}
                        className={`${HEADER_SELECT_CLASS} mt-2 w-full`}
                      >
                        {PLACEHOLDER_DROPDOWN_OPTIONS.map((placeholder) => (
                          <option key={placeholder} value={placeholder}>
                            {placeholder}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      variant="secondary"
                      size="sm"
                      onMouseDown={(event) => {
                        beginPlaceholderToolbarInteraction();
                        event.preventDefault();
                      }}
                      onClick={handleAddPlaceholder}
                      className="sm:min-w-[110px]"
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className={LABEL_CLASS}>Quick Actions</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <Button variant="secondary" size="sm" onClick={handlePrintTest} fullWidth>
                    <Printer className="h-4 w-4" />
                    Print test
                  </Button>
                  <Button variant="secondary" size="sm" onClick={handleUploadLogoClick} fullWidth>
                    <Upload className="h-4 w-4" />
                    {hasLogo ? "Replace logo" : "Add logo"}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={handleCreateNewTemplate} fullWidth>
                    <Plus className="h-4 w-4" />
                    New template
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleReset} fullWidth>
                    <RotateCcw className="h-4 w-4" />
                    Reset
                  </Button>
                  <Button
                    variant="success"
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving}
                    fullWidth
                    className="sm:col-span-2 xl:col-span-1"
                  >
                    <Save className="h-4 w-4" />
                    {isSaving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <div className={`grid grid-cols-1 gap-6 ${canAccessHeaderToolsAndProperties ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
        <Card className="border-slate-200/90 bg-white">
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Editing Service</div>
                <div className="mt-1 text-sm font-semibold text-slate-800">{selectedServiceLabel}</div>
              </div>
              <div
                className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
                style={themeBadgeStyle}
              >
                Theme: {themeConfig.label}
              </div>
            </div>
            <div
              ref={previewViewportRef}
              className="overflow-hidden rounded-[28px] border border-slate-200 bg-white p-4 lg:p-7"
            >
              <div
                className="mx-auto"
                style={{
                  width: `${pageWidth * previewScale}px`,
                  height: `${pageHeight * previewScale}px`,
                }}
              >
                <div
                  ref={sheetRef}
                  className="certificate-print-sheet relative overflow-hidden rounded-[34px]"
                  style={{
                    ...getCertificateThemeShellStyle(themeConfig.value),
                    width: `${pageWidth}px`,
                    height: `${pageHeight}px`,
                    transform: `scale(${previewScale})`,
                    transformOrigin: "top left",
                  }}
                >
                  <CertificateThemeLayers themeKey={themeConfig.value} />
                  {hasLogo ? (
                    <div
                      onPointerDown={handleDragStart("logo")}
                      data-drag-key={getDragKey("logo")}
                      className={`absolute z-20 grid place-items-center overflow-hidden rounded-full ${
                        "cursor-grab touch-none select-none active:cursor-grabbing"
                      } ${dragTarget === getDragKey("logo") ? "outline outline-2 outline-slate-300/70" : ""}`}
                      style={{
                        ...logoStyle,
                        ...getCertificateThemeLogoStyle(themeConfig.value),
                      }}
                    >
                      <img
                        src={certificate.logoSrc}
                        alt="Certificate logo"
                        className="h-full w-full rounded-full object-cover"
                        draggable={false}
                      />
                    </div>
                  ) : null}

                  {hasMainContent ? (
                    isEditingBlock("content") ? (
                      <textarea
                        autoFocus
                        ref={inlineEditorRef}
                        value={template.contentBlock.text}
                        onChange={(event) => updateBlock("text", event.target.value)}
                        onBlur={handleInlineEditorBlur}
                        onPointerDown={(event) => event.stopPropagation()}
                        {...createPlaceholderFieldBindings({ kind: "content" })}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.key === "Escape") {
                            event.preventDefault();
                            stopInlineEditing();
                          }
                        }}
                        className="absolute z-20 resize-none bg-transparent px-2 py-2 font-sans leading-[1.55] outline-none"
                        style={{
                          ...contentStyle,
                          width: editingBounds?.width ? `${editingBounds.width}px` : contentStyle.width,
                          minHeight: editingBounds?.height ? `${editingBounds.height}px` : undefined,
                          boxSizing: "border-box",
                          caretColor: certificate.contentBlock.color || "#000000",
                          overflow: "hidden",
                        }}
                      />
                    ) : (
                      <div
                        onDoubleClick={startInlineEditing("content")}
                        data-drag-key={getDragKey("content")}
                        className="absolute z-10 select-none whitespace-pre-wrap break-words px-2 py-2 font-sans leading-[1.55]"
                        style={contentStyle}
                      >
                        {certificate.contentBlock.text}
                      </div>
                    )
                  ) : null}

                  {certificate.textBlocks.map((block, index) => (
                    isEditingBlock("text", block.id) ? (
                      <textarea
                        key={block.id}
                        autoFocus
                        ref={inlineEditorRef}
                        value={block.text}
                        onChange={(event) => updateTextBlock(block.id, "text", event.target.value)}
                        onBlur={handleInlineEditorBlur}
                        onPointerDown={(event) => event.stopPropagation()}
                        {...createPlaceholderFieldBindings({ kind: "text", blockId: block.id })}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.key === "Escape") {
                            event.preventDefault();
                            stopInlineEditing();
                          }
                        }}
                      className="absolute z-20 resize-none bg-transparent px-2 py-2 font-sans leading-[1.45] outline-none"
                      style={{
                        ...getTextBlockStyle(block),
                        width: editingBounds?.width ? `${editingBounds.width}px` : `${block.width}px`,
                        minHeight: editingBounds?.height ? `${editingBounds.height}px` : undefined,
                        boxSizing: "border-box",
                        caretColor: block.color || "#000000",
                        overflow: "hidden",
                      }}
                    />
                  ) : (
                      <div
                        key={block.id}
                        onDoubleClick={startInlineEditing("text", block.id)}
                        data-drag-key={getDragKey("text", block.id)}
                        className="absolute z-10 select-none whitespace-pre-wrap break-words px-2 py-2 font-sans leading-[1.45]"
                        style={getTextBlockStyle(block)}
                      >
                        {block.text || getDefaultAddedTextLabel(index)}
                      </div>
                    )
                  ))}

                  {certificate.signatureBlocks.map((block, index) => {
                    const signatureLabelParts = getSignatureLabelParts(block.label);
                    const signatureImageBottomOffset = getSignatureImageBottomOffset(
                      block,
                      signatureLabelParts.topText
                    );

                    return (
                      <div
                        key={block.id}
                        data-drag-key={getDragKey("signature", block.id)}
                        onPointerDown={handleImageOnlyDragStart("signature", block.id)}
                        className={`absolute z-10 select-none rounded-xl px-2 py-2 text-center font-sans ${
                          dragTarget === getDragKey("signature", block.id) ? "outline outline-2 outline-slate-300/70" : ""
                        }`}
                        style={getSignatureStyle(block)}
                      >
                        {block.signatureSrc ? (
                          <img
                            src={block.signatureSrc}
                            alt=""
                            className="absolute left-1/2 max-w-[92%] -translate-x-1/2 cursor-grab object-contain touch-none active:cursor-grabbing"
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
                        <div className="h-px" style={{ backgroundColor: block.color }} />
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
          </CardContent>
        </Card>

        {canAccessHeaderToolsAndProperties ? (
        <Card className="h-fit overflow-hidden border-slate-200/90 bg-white/95 max-h-[80vh] lg:sticky lg:top-6 lg:max-h-[calc(100vh-2rem)]">
          <CardHeader>
            <CardTitle>Properties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 max-h-[calc(80vh-5rem)] overflow-y-auto pr-2 lg:max-h-[calc(100vh-8rem)]">
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className={LABEL_CLASS}>Logo</div>
                <Button variant="primary" size="sm" onClick={handleUploadLogoClick}>
                  <Upload className="h-4 w-4" />
                  {hasLogo ? "Replace logo" : "Add logo"}
                </Button>
              </div>

              {reusableLogoAssets.length ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-slate-700">Reuse saved logo</div>
                  <div className="grid gap-2">
                    {reusableLogoAssets.map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => applyReusableLogo(asset.src)}
                        className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40"
                      >
                        <img src={asset.src} alt="" className="h-12 w-12 rounded-full object-cover" />
                        <span className="text-sm font-medium text-slate-700">{asset.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {hasLogo ? (
                <>
                  <div>
                    <div className="text-sm font-medium text-slate-700">Alignment</div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <Button
                        variant={
                          Math.abs(
                            certificate.logoBlock.x -
                              getAlignedCanvasX("left", certificate.logoBlock.size, pageWidth)
                          ) <= 1
                            ? "primary"
                            : "secondary"
                        }
                        size="sm"
                        onClick={() => alignLogoHorizontally("left")}
                        className="w-full"
                      >
                        <AlignLeft className="h-4 w-4" />
                        Left
                      </Button>
                      <Button
                        variant={
                          Math.abs(certificate.logoBlock.x - Math.round(Math.max(0, pageWidth - certificate.logoBlock.size) / 2)) <= 1
                            ? "primary"
                            : "secondary"
                        }
                        size="sm"
                        onClick={() => alignLogoHorizontally("center")}
                        className="w-full"
                      >
                        <AlignCenter className="h-4 w-4" />
                        Center
                      </Button>
                      <Button
                        variant={
                          Math.abs(
                            certificate.logoBlock.x -
                              getAlignedCanvasX("right", certificate.logoBlock.size, pageWidth)
                          ) <= 1
                            ? "primary"
                            : "secondary"
                        }
                        size="sm"
                        onClick={() => alignLogoHorizontally("right")}
                        className="w-full"
                      >
                        <AlignRight className="h-4 w-4" />
                        Right
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">X (px)</span>
                      <EditableNumberInput
                        min={logoHorizontalBounds.min}
                        max={logoHorizontalBounds.max}
                        value={template.logoBlock.x}
                        onValueChange={(nextValue) => updateLogoBlock("x", nextValue)}
                        className={FIELD_CLASS}
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">Y (px)</span>
                      <EditableNumberInput
                        min={logoVerticalBounds.min}
                        max={logoVerticalBounds.max}
                        value={template.logoBlock.y}
                        onValueChange={(nextValue) => updateLogoBlock("y", nextValue)}
                        className={FIELD_CLASS}
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Size (px)</span>
                    <EditableNumberInput
                      min="72"
                      max="180"
                      value={template.logoBlock.size}
                      onValueChange={(nextValue) => updateLogoBlock("size", nextValue)}
                      className={FIELD_CLASS}
                    />
                  </label>

                  <Button variant="secondary" size="sm" onClick={handleRemoveLogo}>
                    <Trash2 className="h-4 w-4" />
                    Remove logo
                  </Button>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-4 text-sm text-slate-500">
                  No logo added yet.
                </div>
              )}
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className={LABEL_CLASS}>Added Texts</div>
                <Button variant="primary" size="sm" onClick={addTextBlock}>
                  <Plus className="h-4 w-4" />
                  Add text
                </Button>
              </div>

              {template.textBlocks.length ? (
                template.textBlocks.map((block, index) => {
                  return (
                    <div key={block.id} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-800">Text {index + 1}</div>
                        <Button variant="secondary" size="sm" onClick={() => removeTextBlock(block.id)}>
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </Button>
                      </div>

                      <label className="block">
                        <span className={LABEL_CLASS}>Text</span>
                        <TiptapPlainTextField
                          editorKey={`text:${block.id}`}
                          value={block.text}
                          onChange={(nextValue) => updateTextBlock(block.id, "text", nextValue)}
                          onFocusEditor={rememberRichTextEditorTarget}
                          registerEditor={registerRichTextEditor}
                          unregisterEditor={unregisterRichTextEditor}
                        />
                      </label>

                      <label className="block">
                        <span className="text-sm font-medium text-slate-700">Font size (px)</span>
                        <EditableNumberInput
                          min="12"
                          max="48"
                          value={block.fontSize}
                          onValueChange={(nextValue) => updateTextBlock(block.id, "fontSize", nextValue)}
                          className={FIELD_CLASS}
                        />
                      </label>

                      <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
                        <input
                          type="checkbox"
                          checked={block.bold}
                          onChange={(event) => updateTextBlock(block.id, "bold", event.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                          <Bold className="h-4 w-4" />
                          Bold text
                        </span>
                      </label>

                      <div>
                        <div className="text-sm font-medium text-slate-700">Text alignment</div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <Button
                            variant={block.align === "" ? "primary" : "secondary"}
                            size="sm"
                            onClick={() => updateTextBlock(block.id, "align", "")}
                            className="w-full"
                          >
                            Free
                          </Button>
                          <Button
                            variant={block.align === "left" ? "primary" : "secondary"}
                            size="sm"
                            onClick={() => updateTextBlock(block.id, "align", "left")}
                            className="w-full"
                          >
                            <AlignLeft className="h-4 w-4" />
                            Left
                          </Button>
                          <Button
                            variant={block.align === "center" ? "primary" : "secondary"}
                            size="sm"
                            onClick={() => updateTextBlock(block.id, "align", "center")}
                            className="w-full"
                          >
                            <AlignCenter className="h-4 w-4" />
                            Center
                          </Button>
                          <Button
                            variant={block.align === "right" ? "primary" : "secondary"}
                            size="sm"
                            onClick={() => updateTextBlock(block.id, "align", "right")}
                            className="w-full"
                          >
                            <AlignRight className="h-4 w-4" />
                            Right
                          </Button>
                        </div>
                        <div className="mt-2 text-xs text-slate-500">
                          Free keeps the block unaligned so you can place it anywhere on the certificate.
                        </div>
                      </div>

                      <div>
                        <div className="text-sm font-medium text-slate-700">Text color</div>
                        <div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
                          <input
                            type="color"
                            value={block.color}
                            onChange={(event) => updateTextBlock(block.id, "color", event.target.value)}
                            className="h-11 w-14 cursor-pointer rounded border-0 bg-transparent p-0"
                          />
                          <div>
                            <div className="text-sm font-semibold text-slate-800">{block.color}</div>
                            <div className="text-xs text-slate-500">Use the color picker to update the extra text.</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-4 text-sm text-slate-500">
                  No added text yet.
                </div>
              )}
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className={LABEL_CLASS}>Signature Lines</div>
                <Button variant="primary" size="sm" onClick={addSignatureLine}>
                  <Plus className="h-4 w-4" />
                  Add line
                </Button>
              </div>

              {template.signatureBlocks.length ? (
                template.signatureBlocks.map((block, index) => {
                  const normalizedBlock = certificate.signatureBlocks.find((item) => item.id === block.id) || block;

                  return (
                    <div key={block.id} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-800">Signature {index + 1}</div>
                        <Button variant="secondary" size="sm" onClick={() => removeSignatureLine(block.id)}>
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </Button>
                      </div>

                      <label className="block">
                        <span className={LABEL_CLASS}>Label</span>
                        <TiptapPlainTextField
                          editorKey={`signature:${block.id}`}
                          value={block.label}
                          onChange={(nextValue) => updateSignatureLine(block.id, "label", nextValue)}
                          onFocusEditor={rememberRichTextEditorTarget}
                          registerEditor={registerRichTextEditor}
                          unregisterEditor={unregisterRichTextEditor}
                          minHeightClass="min-h-[84px]"
                        />
                      </label>

                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" onClick={() => openSignaturePad(block.id)}>
                          {normalizedBlock.signatureSrc ? "Replace drawing" : "Draw signature"}
                        </Button>
                        {reusableSignatureAssets.length ? (
                          <select
                            value=""
                            onChange={(event) => {
                              applyReusableSignature(block.id, event.target.value);
                              event.target.value = "";
                            }}
                            className={HEADER_SELECT_CLASS}
                          >
                            <option value="">Use saved signature</option>
                            {reusableSignatureAssets.map((asset) => (
                              <option key={asset.id} value={asset.src}>
                                {asset.label}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        {normalizedBlock.signatureSrc ? (
                          <Button variant="secondary" size="sm" onClick={() => clearSavedSignature(block.id)}>
                            <Trash2 className="h-4 w-4" />
                            Remove drawing
                          </Button>
                        ) : null}
                      </div>

                      {normalizedBlock.signatureSrc ? (
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Saved Drawing
                          </div>
                          <div className="flex min-h-[96px] items-end justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-3">
                            <img
                              src={normalizedBlock.signatureSrc}
                              alt=""
                              className="max-w-full object-contain"
                              style={{ height: `${getSignatureImageHeight(normalizedBlock)}px` }}
                              draggable={false}
                            />
                          </div>
                        </div>
                      ) : null}

                      <div>
                        <div className="text-sm font-medium text-slate-700">Alignment</div>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          <Button
                            variant={
                              Math.abs(
                                normalizedBlock.x - getAlignedCanvasX("left", normalizedBlock.width, pageWidth)
                              ) <= 1
                                ? "primary"
                                : "secondary"
                            }
                            size="sm"
                            onClick={() => alignSignatureHorizontally(block.id, "left")}
                            className="w-full"
                          >
                            <AlignLeft className="h-4 w-4" />
                            Left
                          </Button>
                          <Button
                            variant={
                              Math.abs(normalizedBlock.x - Math.round(Math.max(0, pageWidth - normalizedBlock.width) / 2)) <= 1
                                ? "primary"
                                : "secondary"
                            }
                            size="sm"
                            onClick={() => alignSignatureHorizontally(block.id, "center")}
                            className="w-full"
                          >
                            <AlignCenter className="h-4 w-4" />
                            Center
                          </Button>
                          <Button
                            variant={
                              Math.abs(
                                normalizedBlock.x - getAlignedCanvasX("right", normalizedBlock.width, pageWidth)
                              ) <= 1
                                ? "primary"
                                : "secondary"
                            }
                            size="sm"
                            onClick={() => alignSignatureHorizontally(block.id, "right")}
                            className="w-full"
                          >
                            <AlignRight className="h-4 w-4" />
                            Right
                          </Button>
                        </div>
                      </div>

                      <label className="block">
                        <span className="text-sm font-medium text-slate-700">Font size (px)</span>
                        <EditableNumberInput
                          min="8"
                          max="32"
                          value={normalizedBlock.fontSize}
                          onValueChange={(nextValue) => updateSignatureLine(block.id, "fontSize", nextValue)}
                          className={FIELD_CLASS}
                        />
                      </label>

                      <div>
                        <div className="text-sm font-medium text-slate-700">Text color</div>
                        <div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
                          <input
                            type="color"
                            value={normalizedBlock.color}
                            onChange={(event) => updateSignatureLine(block.id, "color", event.target.value)}
                            className="h-11 w-14 cursor-pointer rounded border-0 bg-transparent p-0"
                          />
                          <div>
                            <div className="text-sm font-semibold text-slate-800">{normalizedBlock.color}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-4 text-sm text-slate-500">
                  No signature lines yet.
                </div>
              )}
            </section>
          </CardContent>
        </Card>
        ) : null}
      </div>

      {signaturePadTargetId && signaturePadBlock ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onClick={closeSignaturePad}>
          <div
            className="w-full max-w-4xl rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.28)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Signature Pad</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {getSignatureLabelParts(signaturePadBlock.label).bottomText ||
                    `Signature ${template.signatureBlocks.findIndex((block) => block.id === signaturePadTargetId) + 1}`}
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  Draw inside the pad below. Saving will replace the current signature drawing for this block.
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={closeSignaturePad}>
                Close
              </Button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div
                ref={signaturePadShellRef}
                className="overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50/80 p-3"
              >
                <SignatureCanvas
                  key={`${signaturePadTargetId}-${signaturePadWidth}`}
                  ref={signaturePadRef}
                  penColor={signaturePadBlock.color}
                  minWidth={1.2}
                  maxWidth={2.4}
                  clearOnResize={false}
                  canvasProps={{
                    width: signaturePadWidth,
                    height: SIGNATURE_PAD_HEIGHT,
                    className: "w-full rounded-[18px] bg-white shadow-inner",
                  }}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-500">
                  Pen color follows the signature text color: <span className="font-semibold text-slate-800">{signaturePadBlock.color}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={clearSignaturePad}>
                    Clear pad
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => clearSavedSignature(signaturePadBlock.id)}>
                    Remove saved drawing
                  </Button>
                  <Button variant="success" size="sm" onClick={saveSignaturePad}>
                    Save drawing
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
