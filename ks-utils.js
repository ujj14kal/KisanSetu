/* Kisan Setu — shared utilities */
(function () {
  const css = `
    #ks-toast-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      z-index: 99999;
      pointer-events: none;
    }
    .ks-toast {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      min-width: 280px;
      max-width: 360px;
      padding: 14px 18px;
      border-radius: 14px;
      font-family: 'Hind', 'Segoe UI', sans-serif;
      font-size: 0.92rem;
      font-weight: 500;
      line-height: 1.45;
      box-shadow: 0 8px 28px rgba(0,0,0,0.18);
      pointer-events: all;
      cursor: pointer;
      opacity: 0;
      transform: translateY(16px) scale(0.97);
      transition: opacity 0.28s ease, transform 0.28s ease;
    }
    .ks-toast.show {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    .ks-toast.hide {
      opacity: 0;
      transform: translateY(8px) scale(0.96);
    }
    .ks-toast-success { background: #2e7d32; color: #fff; }
    .ks-toast-error   { background: #c0392b; color: #fff; }
    .ks-toast-warning { background: #e67e00; color: #fff; }
    .ks-toast-info    { background: #1565c0; color: #fff; }
    .ks-toast-icon { font-size: 1.1rem; flex-shrink: 0; margin-top: 1px; }
    .ks-toast-msg  { flex: 1; }

    /* Page-level loading overlay */
    #ks-page-loader {
      position: fixed; inset: 0; z-index: 99998;
      background: #f4f8f3;
      display: flex; align-items: center; justify-content: center;
      flex-direction: column; gap: 14px;
      transition: opacity 0.4s ease;
    }
    #ks-page-loader.hidden { opacity: 0; pointer-events: none; }
    #ks-page-loader .loader-leaf {
      font-size: 2.4rem;
      animation: ks-pulse 1.2s ease-in-out infinite;
    }
    #ks-page-loader .loader-bar {
      width: 160px; height: 4px; background: #d4e9d6;
      border-radius: 4px; overflow: hidden;
    }
    #ks-page-loader .loader-bar-fill {
      width: 0%; height: 100%; background: #2e7d32;
      border-radius: 4px;
      animation: ks-loading 1.4s ease-in-out infinite;
    }
    @keyframes ks-pulse {
      0%,100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.15); opacity: 0.75; }
    }
    @keyframes ks-loading {
      0%   { width: 0%; margin-left: 0; }
      50%  { width: 70%; margin-left: 0; }
      100% { width: 0%; margin-left: 100%; }
    }

    /* Input with icon wrapper */
    .ks-input-wrap { position: relative; }
    .ks-input-wrap input { padding-right: 44px; }
    .ks-input-toggle {
      position: absolute; right: 13px; top: 50%;
      transform: translateY(-50%);
      background: none; border: none; padding: 0;
      cursor: pointer; color: #888; font-size: 1rem;
      line-height: 1; transition: color 0.2s;
    }
    .ks-input-toggle:hover { color: #2e7d32; }

    @media (max-width: 576px) {
      #ks-toast-container { bottom: 16px; right: 12px; left: 12px; }
      .ks-toast { min-width: unset; }
    }
  `;

  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const container = document.createElement("div");
  container.id = "ks-toast-container";
  document.body.appendChild(container);

  const ICONS = { success: "✓", error: "✕", warning: "⚠", info: "ℹ" };

  window.showToast = function (message, type = "success", duration = 3800) {
    const toast = document.createElement("div");
    toast.className = `ks-toast ks-toast-${type}`;
    toast.innerHTML = `
      <span class="ks-toast-icon">${ICONS[type] || "✓"}</span>
      <span class="ks-toast-msg">${message}</span>
    `;
    toast.onclick = () => dismissToast(toast);
    container.appendChild(toast);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add("show"));
    });
    const t = setTimeout(() => dismissToast(toast), duration);
    toast._timer = t;
  };

  function dismissToast(toast) {
    clearTimeout(toast._timer);
    toast.classList.add("hide");
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 320);
  }

  /* Password show/hide toggle helper */
  window.ksAddPasswordToggle = function (inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const wrap = document.createElement("div");
    wrap.className = "ks-input-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ks-input-toggle";
    btn.setAttribute("aria-label", "Toggle password visibility");
    btn.innerHTML = "👁";
    btn.onclick = () => {
      const isPass = input.type === "password";
      input.type = isPass ? "text" : "password";
      btn.innerHTML = isPass ? "🙈" : "👁";
    };
    wrap.appendChild(btn);
  };

  /* Button loading state helpers */
  window.ksSetBtnLoading = function (btn, text = "Please wait…") {
    btn.disabled = true;
    btn._originalHTML = btn.innerHTML;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" style="width:14px;height:14px;border-width:2px"></span>${text}`;
  };

  window.ksResetBtn = function (btn) {
    btn.disabled = false;
    if (btn._originalHTML) btn.innerHTML = btn._originalHTML;
  };
})();
