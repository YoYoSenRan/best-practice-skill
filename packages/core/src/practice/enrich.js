const http = require("node:http");
const https = require("node:https");
const { URL } = require("node:url");

const ENTITY_MAP = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
};

function decodeHtmlEntities(text) {
  return String(text || "").replace(/&(amp|quot|#39|lt|gt|nbsp);/g, (match) => {
    return ENTITY_MAP[match] || match;
  });
}

function stripHtml(html) {
  return decodeHtmlEntities(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

function splitSentences(text) {
  return String(text || "")
    .split(/(?<=[。！？.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 36);
}

function computeCoverage(sentence, keywords) {
  if (!Array.isArray(keywords) || keywords.length === 0) {
    return 0;
  }

  const tokens = new Set(tokenize(sentence));
  const hits = keywords.filter((keyword) => tokens.has(keyword));
  return hits.length / keywords.length;
}

function scoreSentence(sentence, keywords) {
  const coverage = computeCoverage(sentence, keywords);
  const bestPracticeHint = /(best practice|recommended|should|must|avoid|pitfall|建议|必须|避免|最佳实践)/i.test(
    sentence
  )
    ? 0.1
    : 0;

  return Math.min(1, coverage + bestPracticeHint);
}

function fetchText(url, options = {}) {
  const timeoutMs = options.timeoutMs || 5000;
  const maxBytes = options.maxBytes || 200000;
  const maxRedirects = options.maxRedirects || 2;

  return new Promise((resolve, reject) => {
    const transport = url.startsWith("https:") ? https : http;
    const request = transport.get(
      url,
      {
        timeout: timeoutMs,
        headers: {
          "User-Agent": "best-practice-skill/0.1",
          Accept: "text/html,text/plain,*/*",
        },
      },
      (response) => {
        const statusCode = response.statusCode || 500;
        const location = response.headers.location;

        if ([301, 302, 303, 307, 308].includes(statusCode) && location && maxRedirects > 0) {
          response.resume();
          const nextUrl = new URL(location, url).toString();
          fetchText(nextUrl, {
            timeoutMs,
            maxBytes,
            maxRedirects: maxRedirects - 1,
          })
            .then(resolve)
            .catch(reject);
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`HTTP ${statusCode}`));
          return;
        }

        const contentType = String(response.headers["content-type"] || "").toLowerCase();
        if (!contentType.includes("text") && !contentType.includes("html") && !contentType.includes("json")) {
          response.resume();
          reject(new Error(`Unsupported content-type: ${contentType || "unknown"}`));
          return;
        }

        let raw = "";
        let bytes = 0;
        let truncated = false;
        response.setEncoding("utf-8");
        response.on("data", (chunk) => {
          if (truncated) {
            return;
          }

          const nextBytes = bytes + Buffer.byteLength(chunk, "utf-8");
          if (nextBytes > maxBytes) {
            const remain = Math.max(0, maxBytes - bytes);
            raw += chunk.slice(0, remain);
            bytes = maxBytes;
            truncated = true;
            return;
          }

          bytes = nextBytes;
          raw += chunk;
        });
        response.on("end", () => resolve(raw));
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("Request timeout"));
    });

    request.on("error", reject);
  });
}

function pickEvidenceSentences(text, keywords, options = {}) {
  const maxEvidence = options.maxEvidence || 2;
  const minCoverage = options.minCoverage || 0.2;
  const maxLength = options.maxLength || 240;

  const sentences = splitSentences(text);
  const ranked = sentences
    .map((sentence) => {
      const coverage = computeCoverage(sentence, keywords);
      const score = scoreSentence(sentence, keywords);
      return {
        sentence,
        coverage,
        score,
      };
    })
    .filter((item) => item.coverage >= minCoverage)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxEvidence)
    .map((item) => ({
      text: item.sentence.length > maxLength
        ? `${item.sentence.slice(0, maxLength - 1)}…`
        : item.sentence,
      coverage: item.coverage,
      score: item.score,
    }));

  return ranked;
}

async function enrichRankedResults(rankedResults, context = {}, enrichStage = {}) {
  const enabled = enrichStage.enabled !== false;
  if (!enabled || !Array.isArray(rankedResults) || rankedResults.length === 0) {
    return {
      results: rankedResults || [],
      errors: [],
      fetchedCount: 0,
    };
  }

  const maxFetch = Number(enrichStage.maxFetch || 3);
  const timeoutMs = Number(enrichStage.timeoutMs || 5000);
  const maxEvidencePerResult = Number(enrichStage.maxEvidencePerResult || 2);
  const minCoverage = Number(enrichStage.minCoverage || 0.2);
  const maxSentenceLength = Number(enrichStage.maxSentenceLength || 240);
  const keywords = Array.isArray(context.keywords) ? context.keywords : [];

  const errors = [];
  const results = [...rankedResults];

  for (let index = 0; index < results.length && index < maxFetch; index += 1) {
    const item = results[index];

    try {
      const raw = await fetchText(item.url, { timeoutMs });
      const text = stripHtml(raw);
      const evidence = pickEvidenceSentences(text, keywords, {
        maxEvidence: maxEvidencePerResult,
        minCoverage,
        maxLength: maxSentenceLength,
      });

      results[index] = {
        ...item,
        evidence,
      };
    } catch (error) {
      errors.push({
        url: item.url,
        message: error.message,
      });
      results[index] = {
        ...item,
        evidence: [],
      };
    }
  }

  return {
    results,
    errors,
    fetchedCount: Math.min(maxFetch, results.length),
  };
}

function buildEvidenceChain(results, options = {}) {
  const maxItems = Number(options.maxItems || 5);
  const maxEvidencePerItem = Number(options.maxEvidencePerItem || 1);

  const chain = [];

  for (const item of (results || []).slice(0, maxItems)) {
    const evidence = Array.isArray(item.evidence)
      ? item.evidence.slice(0, maxEvidencePerItem)
      : [];

    for (const snippet of evidence) {
      chain.push({
        title: item.title,
        url: item.url,
        excerpt: snippet.text,
        score: snippet.score,
      });
    }
  }

  return chain;
}

module.exports = {
  enrichRankedResults,
  buildEvidenceChain,
};
