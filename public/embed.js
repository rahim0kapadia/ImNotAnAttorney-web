/**
 * ImNotAnAttorney Embed Script
 *
 * Usage:
 * <script src="https://imnotanattorney.com/embed.js"></script>
 * <div data-ina-embed="badge"></div>
 *
 * Options:
 * <div data-ina-embed="badge" data-ina-theme="dark"></div>
 * <div data-ina-embed="badge" data-ina-theme="light"></div>
 */
(function() {
  "use strict";

  const CONFIG = {
    baseUrl: "https://imnotanattorney.com",
    guidePath: "/guides/10-questions-your-attorney-hopes-you-never-ask.pdf",
  };

  const styles = `
    .ina-embed-container {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      max-width: 320px;
      border-radius: 8px;
      padding: 16px;
      background: linear-gradient(135deg, #18181b 0%, #09090b 100%);
      border: 1px solid #f59e0b;
      color: #fff;
      box-sizing: border-box;
    }
    .ina-embed-container * {
      box-sizing: border-box;
    }
    .ina-embed-header {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .ina-embed-icon {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #f59e0b;
      color: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 18px;
      flex-shrink: 0;
    }
    .ina-embed-title {
      font-size: 14px;
      font-weight: 600;
      line-height: 1.3;
    }
    .ina-embed-desc {
      font-size: 12px;
      color: #a1a1aa;
      margin-top: 4px;
      line-height: 1.4;
    }
    .ina-embed-link {
      display: inline-block;
      margin-top: 12px;
      font-size: 12px;
      font-weight: 600;
      color: #f59e0b;
      text-decoration: none;
    }
    .ina-embed-link:hover {
      color: #fbbf24;
    }
  `;

  function createBadge() {
    const container = document.createElement("div");
    container.className = "ina-embed-container";
    container.innerHTML = `
      <div class="ina-embed-header">
        <div class="ina-embed-icon">?</div>
        <div>
          <div class="ina-embed-title">Questions for your attorney?</div>
          <div class="ina-embed-desc">Free questions guide from ImNotAnAttorney</div>
        </div>
      </div>
      <a href="${CONFIG.baseUrl}${CONFIG.guidePath}" class="ina-embed-link" target="_blank" rel="noopener noreferrer">
        Download Free Guide →
      </a>
    `;
    return container;
  }

  function init() {
    // Inject styles
    if (!document.getElementById("ina-embed-styles")) {
      const styleEl = document.createElement("style");
      styleEl.id = "ina-embed-styles";
      styleEl.textContent = styles;
      document.head.appendChild(styleEl);
    }

    // Find all embed containers
    const containers = document.querySelectorAll("[data-ina-embed]");
    containers.forEach(function(container) {
      const type = container.getAttribute("data-ina-embed");
      if (type === "badge") {
        const badge = createBadge();
        container.innerHTML = "";
        container.appendChild(badge);
      }
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
