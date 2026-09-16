// Values to inject into the pixel
const PARAMETER_MAP = {
  gdpr: "#{GDPR}",
  gdpr_consent: "#{GDPR_CONSENT_285}",
  gdpr_pd: "${GDPR_PD}",
  omidPartner: "[YOUR_FREEWHEEL_OMID_PARTNER]",
  xsId: "#{ad.random}",
  ias_xappb: '#{section.attribute("appBundle")}',
  bundleid: '#{section.attribute("appBundle")}',
  ord: "#{timestamp}",
  dc_rdid: '#{ifEmpty("X",request.deviceId)}',
  rand: "#{ad.ref.random}",
  creativename: "",
  campaignname: "",
  r: "#{timestamp}"
};

const NIELSEN_PREFIX = "https://secure-gl.imrworldwide.com";

const NIELSEN_APPEND =
  '&c8=devgrp,#{section.attribute("nielsen_device")}' +
  '&c9=devid,#{request.deviceId}' +
  '&c10=plt,#{section.attribute("nielsen_platfrm")}' +
  '&c13=asid,P35C37763-246D-4794-AE3B-32C163614FED' +
  '&uoo=#{request.deviceOptOut}';

const TECHOPS_EMAIL = "siwei.chan@francetvpub.fr";


// --------------------------------------------------
// Replace the value of a query parameter
// Supports &, ; and ? as parameter separators
// --------------------------------------------------

function replaceParameter(url, parameter, value) {
  const regex = new RegExp(`([?&;]${parameter}=)[^&;]*`);
  return url.replace(regex, `$1${value}`);
}


// --------------------------------------------------
// Detect parameters containing macros that are not
// listed in PARAMETER_MAP
// --------------------------------------------------

function findUnmappedParameters(pixel) {
  const unmapped = [];

  // Split parameters using ?, & or ;
  const parts = pixel.split(/[?&;]/);

  for (const part of parts) {

    // Ignore anything that is not parameter=value
    if (!part.includes("=")) {
      continue;
    }

    const equalIndex = part.indexOf("=");

    const parameter = part
      .substring(0, equalIndex)
      .trim();

    const value = part
      .substring(equalIndex + 1)
      .trim();

    // Known parameter -> already handled by PARAMETER_MAP
    if (Object.prototype.hasOwnProperty.call(PARAMETER_MAP, parameter)) {
      continue;
    }

    // Detect macro / placeholder syntax
    const containsMacro =
      value.includes("${") ||
      value.includes("#{") ||
      value.includes("[") ||
      value.includes("INSERTMACROHERE");

    if (containsMacro) {
      unmapped.push({
        parameter,
        value
      });
    }
  }

  return unmapped;
}


// --------------------------------------------------
// Add Nielsen-specific parameters
// --------------------------------------------------

function addNielsenParameters(url) {

  // Only apply to Nielsen pixels
  if (!url.startsWith(NIELSEN_PREFIX)) {
    return url;
  }

  // Avoid adding Nielsen parameters twice
  if (url.includes("c8=devgrp,")) {
    return url;
  }

  // Insert before r= if present
  if (/[&;]r=/.test(url)) {
    return url.replace(
      /([&;])r=/,
      `${NIELSEN_APPEND}$1r=`
    );
  }

  // Otherwise append at the end
  return url + NIELSEN_APPEND;
}


// --------------------------------------------------
// Main conversion function
// --------------------------------------------------

function convertPixel(pixel) {

  let result = pixel;
  let replacements = 0;

  // -----------------------------------------------
  // 1. Check for unmapped macros
  // -----------------------------------------------

  const unmappedParameters = findUnmappedParameters(pixel);

  if (unmappedParameters.length > 0) {

    const details = unmappedParameters
      .map(item => `${item.parameter}=${item.value}`)
      .join(", ");

    throw new Error(
      `Macro non reconnue détectée : ${details}`
    );
  }


  // -----------------------------------------------
  // 2. Replace configured parameters
  // -----------------------------------------------

  for (const [parameter, value] of Object.entries(PARAMETER_MAP)) {

    const before = result;

    result = replaceParameter(
      result,
      parameter,
      value
    );

    if (result !== before) {
      replacements++;
    }
  }


  // -----------------------------------------------
  // 3. Nielsen-specific processing
  // -----------------------------------------------

  const beforeNielsen = result;

  result = addNielsenParameters(result);

  if (result !== beforeNielsen) {
    replacements++;
  }


  // -----------------------------------------------
  // 4. Nothing could be converted
  // -----------------------------------------------

  if (replacements === 0) {
    throw new Error(
      "Erreur de conversion, veuillez envoyer un mail au TechOps."
    );
  }

  return result;
}


// --------------------------------------------------
// Success message based on tracking provider
// --------------------------------------------------

function getSuccessMessage(pixel) {

  const lower = pixel.toLowerCase();

  if (lower.includes("tvsquared.com")) {
    return "Innovid impression pixel conversion complete.";
  }

  if (lower.includes("doubleclick.net")) {
    return "Doubleclick impression pixel conversion complete.";
  }

  if (lower.includes("imrworldwide")) {
    return "Nielsen (mesure de la couverture sur cible) conversion complete with mDAR parameters included.";
  }

  if (lower.includes("doubleverify")) {
    return "Doubleverify (mesure de la visibilité, brand safety etc) conversion complete.";
  }

  if (lower.includes("adsafeprotected")) {
    return "IAS (mesure de la visibilité, brand safety etc) conversion complete.";
  }

  return "Conversion complete.";
}


// --------------------------------------------------
// Report conversion error
// --------------------------------------------------

function reportConversionError(reason, pixel) {

  status.style.color = "#fb7185";

  status.textContent =
    `Conversion failed: ${reason}`;

  const subject = encodeURIComponent(
    "Erreur de conversion"
  );

  const body = encodeURIComponent(
`Reason:
${reason}

Pixel:
${pixel}

Erreur de conversion.`
  );

  window.location.href =
    `mailto:${TECHOPS_EMAIL}?subject=${subject}&body=${body}`;
}


// --------------------------------------------------
// UI
// --------------------------------------------------

const input = document.getElementById("input");
const output = document.getElementById("output");
const status = document.getElementById("status");


// --------------------------------------------------
// Convert button
// --------------------------------------------------

document.getElementById("convert").addEventListener(
  "click",
  () => {

    if (!input.value.trim()) {

      status.style.color = "#fb7185";
      status.textContent =
        "Paste a pixel first.";

      return;
    }

    try {

      const originalPixel = input.value;

      output.value =
        convertPixel(originalPixel);

      status.style.color = "#5eead4";

      status.textContent =
        getSuccessMessage(originalPixel);

    } catch (error) {

      output.value = "";

      reportConversionError(
        error.message,
        input.value
      );
    }
  }
);


// --------------------------------------------------
// Copy button
// --------------------------------------------------

document.getElementById("copy").addEventListener(
  "click",
  async () => {

    if (!output.value) {
      return;
    }

    try {

      await navigator.clipboard.writeText(
        output.value
      );

      status.style.color = "#5eead4";

      status.textContent =
        "Copied to clipboard.";

    } catch (error) {

      status.style.color = "#fb7185";

      status.textContent =
        "Copy failed.";
    }
  }
);


// --------------------------------------------------
// Clear button
// --------------------------------------------------

document.getElementById("clear").addEventListener(
  "click",
  () => {

    input.value = "";
    output.value = "";

    status.textContent = "";

    status.style.color = "#5eead4";
  }
);
