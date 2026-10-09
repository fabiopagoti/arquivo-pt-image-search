sap.ui.define(["./BaseController", "sap/ui/model/json/JSONModel"], function (__BaseController, JSONModel) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const BaseController = _interopRequireDefault(__BaseController);
  /**
   * @namespace pt.arquivo.imagesearch.controller
   */
  const Main = BaseController.extend("pt.arquivo.imagesearch.controller.Main", {
    constructor: function constructor() {
      BaseController.prototype.constructor.apply(this, arguments);
      this.apiEndpoint = "https://arquivo.pt/imagesearch";
      this.imageCache = new Map();
      this.currentSpread = 0;
      this.isAnimating = false;
      this.onBookCanvasRendered = () => {
        const host = this.byId("bookCanvas").getDomRef();
        const canvas = host?.querySelector("canvas");
        if (!canvas) {
          return;
        }
        if (this.canvas !== canvas) {
          this.canvas = canvas;
          this.context = canvas.getContext("2d") ?? undefined;
          canvas.addEventListener("click", this.onCanvasClick);
          canvas.addEventListener("keydown", this.onCanvasKeyDown);
          this.resizeObserver?.disconnect();
          this.resizeObserver = new ResizeObserver(() => this.renderBook());
          this.resizeObserver.observe(canvas);
        }
        this.renderBook();
      };
      this.onCanvasClick = event => {
        if (!this.canvas) {
          return;
        }
        const bounds = this.canvas.getBoundingClientRect();
        if (event.clientX < bounds.left + bounds.width / 2) {
          this.onPreviousPage();
        } else {
          this.onNextPage();
        }
      };
      this.onCanvasKeyDown = event => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          this.onPreviousPage();
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          this.onNextPage();
        }
      };
    },
    onInit: function _onInit() {
      this.setModel(new JSONModel({
        busy: false,
        statusText: "",
        responseItems: [],
        hasPrevious: false,
        hasNext: false,
        pageIndicator: ""
      }), "imageSearch");
      this.byId("bookCanvas").attachAfterRendering(this.onBookCanvasRendered, this);
      void this.getResourceBundle().then(bundle => {
        const model = this.getModel("imageSearch");
        model.setProperty("/statusText", bundle.getText("searchPrompt"));
        model.setProperty("/pageIndicator", bundle.getText("noBookPages"));
      });
    },
    onSearch: async function _onSearch() {
      const query = this.byId("queryInput").getValue().trim();
      const fromPicker = this.byId("fromDate");
      const toPicker = this.byId("toDate");
      const fromDate = fromPicker.getValue();
      const toDate = toPicker.getValue();
      const model = this.getModel("imageSearch");
      const bundle = await this.getResourceBundle();
      if (!query) {
        model.setProperty("/statusText", bundle.getText("searchPrompt"));
        return;
      }
      if (fromDate && !fromPicker.isValidValue() || toDate && !toPicker.isValidValue() || fromDate && toDate && fromDate > toDate) {
        model.setProperty("/statusText", bundle.getText("invalidDateRange"));
        return;
      }
      const params = new URLSearchParams({
        q: query,
        maxItems: "50",
        offset: "0"
      });
      if (fromDate) {
        params.set("from", this.toApiDate(fromDate, false));
      }
      if (toDate) {
        params.set("to", this.toApiDate(toDate, true));
      }
      model.setProperty("/busy", true);
      model.setProperty("/statusText", bundle.getText("searching"));
      model.setProperty("/responseItems", []);
      this.currentSpread = 0;
      this.updateNavigation();
      this.renderBook();
      try {
        const response = await fetch(`${this.apiEndpoint}?${params.toString()}`, {
          headers: {
            Accept: "application/json"
          }
        });
        const payload = await response.json();
        if (typeof payload !== "object" || payload === null) {
          throw new Error("ImageSearch returned an invalid response");
        }
        const data = payload;
        const images = (data.responseItems ?? []).map(item => {
          const alt = item.imgAlt?.[0] ?? item.imgTitle?.[0] ?? "";
          return {
            imageUrl: item.imgLinkToArchive || item.imgSrc || "",
            title: item.pageTitle || item.imgTitle?.[0] || item.imgSrc || "",
            alt,
            timestamp: this.formatTimestamp(item.imgTstamp || item.pageTstamp),
            pageUrl: item.pageLinkToArchive || ""
          };
        });
        model.setProperty("/responseItems", images);
        model.setProperty("/statusText", bundle.getText("resultsCount", [String(data.totalItems ?? images.length), query]));
        this.updateNavigation();
        this.renderBook();
      } catch (error) {
        console.error("Arquivo.pt ImageSearch request failed", error);
        model.setProperty("/statusText", bundle.getText("searchError"));
        this.renderBook(bundle.getText("searchError"));
      } finally {
        model.setProperty("/busy", false);
      }
    },
    onPreviousPage: function _onPreviousPage() {
      this.turnToSpread(this.currentSpread - 1, -1);
    },
    onNextPage: function _onNextPage() {
      this.turnToSpread(this.currentSpread + 1, 1);
    },
    turnToSpread: function _turnToSpread(targetSpread, direction) {
      const items = this.getItems();
      const lastSpread = Math.max(0, Math.ceil(items.length / 2) - 1);
      if (this.isAnimating || targetSpread < 0 || targetSpread > lastSpread) {
        return;
      }
      this.isAnimating = true;
      const start = performance.now();
      const duration = 460;
      const animate = now => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        this.renderBook(undefined, {
          progress: eased,
          direction
        });
        if (progress < 1) {
          requestAnimationFrame(animate);
          return;
        }
        this.currentSpread = targetSpread;
        this.isAnimating = false;
        this.updateNavigation();
        this.renderBook();
      };
      requestAnimationFrame(animate);
    },
    updateNavigation: function _updateNavigation() {
      const model = this.getModel("imageSearch");
      const total = this.getItems().length;
      const first = total ? this.currentSpread * 2 + 1 : 0;
      const last = total ? Math.min(first + 1, total) : 0;
      void this.getResourceBundle().then(bundle => {
        model.setProperty("/pageIndicator", total ? bundle.getText("bookPageIndicator", [String(first), String(last), String(total)]) : bundle.getText("noBookPages"));
      });
      model.setProperty("/hasPrevious", this.currentSpread > 0);
      model.setProperty("/hasNext", (this.currentSpread + 1) * 2 < total);
    },
    getItems: function _getItems() {
      return this.getModel("imageSearch").getProperty("/responseItems") ?? [];
    },
    renderBook: function _renderBook(message, flip) {
      if (!this.canvas || !this.context) {
        return;
      }
      const bounds = this.canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) {
        return;
      }
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(bounds.width * ratio);
      this.canvas.height = Math.round(bounds.height * ratio);
      const context = this.context;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, bounds.width, bounds.height);
      this.drawBook(context, bounds.width, bounds.height, message);
      if (flip) {
        this.drawTurningPage(context, bounds.width, bounds.height, flip.progress, flip.direction);
      }
    },
    drawBook: function _drawBook(context, width, height, message) {
      const items = this.getItems();
      const bookWidth = Math.min(width * 0.9, height * 1.52);
      const bookHeight = Math.min(height * 0.78, bookWidth * 0.68);
      const left = (width - bookWidth) / 2;
      const top = (height - bookHeight) / 2;
      const pageWidth = bookWidth / 2;
      const itemIndex = this.currentSpread * 2;
      const backdrop = context.createLinearGradient(0, 0, width, height);
      backdrop.addColorStop(0, "#edf2f2");
      backdrop.addColorStop(0.52, "#dfe8e7");
      backdrop.addColorStop(1, "#e8eeeb");
      context.fillStyle = backdrop;
      context.fillRect(0, 0, width, height);
      context.save();
      context.shadowColor = "rgba(30, 46, 42, 0.28)";
      context.shadowBlur = 28;
      context.shadowOffsetY = 14;
      context.fillStyle = "#344e49";
      context.beginPath();
      context.roundRect(left - 7, top - 4, bookWidth + 14, bookHeight + 14, 14);
      context.fill();
      context.restore();
      this.drawPage(context, items[itemIndex], left, top, pageWidth, bookHeight, itemIndex + 1, true, message);
      this.drawPage(context, items[itemIndex + 1], left + pageWidth, top, pageWidth, bookHeight, itemIndex + 2, false, message);
      const spine = context.createLinearGradient(left + pageWidth - 10, 0, left + pageWidth + 10, 0);
      spine.addColorStop(0, "rgba(25, 43, 39, 0.04)");
      spine.addColorStop(0.5, "rgba(28, 44, 40, 0.20)");
      spine.addColorStop(1, "rgba(25, 43, 39, 0.02)");
      context.fillStyle = spine;
      context.fillRect(left + pageWidth - 10, top, 20, bookHeight);
    },
    drawPage: function _drawPage(context, item, x, y, width, height, pageNumber, isLeft, message) {
      const page = context.createLinearGradient(x, y, x + width, y + height);
      page.addColorStop(0, isLeft ? "#fffdf5" : "#fffef9");
      page.addColorStop(1, isLeft ? "#f4eedf" : "#f8f3e8");
      context.fillStyle = page;
      context.beginPath();
      context.roundRect(x, y, width, height, isLeft ? [10, 2, 2, 10] : [2, 10, 10, 2]);
      context.fill();
      const inset = Math.max(20, width * 0.09);
      const contentX = x + inset;
      const contentWidth = width - inset * 2;
      const imageY = y + height * 0.12;
      const imageHeight = height * 0.51;
      context.fillStyle = "#e9e2d3";
      context.beginPath();
      context.roundRect(contentX - 4, imageY - 4, contentWidth + 8, imageHeight + 8, 5);
      context.fill();
      context.fillStyle = "#fff";
      context.fillRect(contentX, imageY, contentWidth, imageHeight);
      if (item?.imageUrl) {
        const image = this.getImage(item.imageUrl);
        if (image.complete && image.naturalWidth) {
          const scale = Math.min(contentWidth / image.naturalWidth, imageHeight / image.naturalHeight);
          const drawWidth = image.naturalWidth * scale;
          const drawHeight = image.naturalHeight * scale;
          context.drawImage(image, contentX + (contentWidth - drawWidth) / 2, imageY + (imageHeight - drawHeight) / 2, drawWidth, drawHeight);
        } else {
          this.drawImagePlaceholder(context, contentX, imageY, contentWidth, imageHeight);
        }
      } else {
        this.drawImagePlaceholder(context, contentX, imageY, contentWidth, imageHeight);
      }
      const titleY = imageY + imageHeight + Math.max(24, height * 0.07);
      context.fillStyle = "#263d37";
      context.font = `600 ${Math.max(12, Math.min(17, width * 0.045))}px system-ui, sans-serif`;
      const title = item?.title || message || "Search to open your book";
      const titleLines = this.wrapText(context, title, contentWidth, 2);
      titleLines.forEach((line, index) => context.fillText(line, contentX, titleY + index * 21));
      if (item?.alt) {
        context.fillStyle = "#66766f";
        context.font = `400 ${Math.max(10, Math.min(12, width * 0.032))}px system-ui, sans-serif`;
        const altLines = this.wrapText(context, item.alt, contentWidth, 2);
        altLines.forEach((line, index) => context.fillText(line, contentX, titleY + titleLines.length * 21 + 5 + index * 16));
      }
      context.fillStyle = "#8b7660";
      context.font = `500 ${Math.max(10, Math.min(12, width * 0.03))}px system-ui, sans-serif`;
      const footer = item?.timestamp ? `${item.timestamp}  ·  Arquivo.pt` : "ARQUIVO.PT  ·  IMAGE ARCHIVE";
      context.fillText(footer, contentX, y + height - Math.max(18, height * 0.055));
      context.strokeStyle = "rgba(106, 94, 72, 0.10)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(contentX, y + height - 13);
      context.lineTo(x + width - inset, y + height - 13);
      context.stroke();
      context.fillStyle = "#9a8b70";
      context.font = "11px system-ui, sans-serif";
      context.textAlign = isLeft ? "left" : "right";
      context.fillText(String(pageNumber), isLeft ? x + inset : x + width - inset, y + height - 3);
      context.textAlign = "left";
    },
    drawTurningPage: function _drawTurningPage(context, width, height, progress, direction) {
      const items = this.getItems();
      const bookWidth = Math.min(width * 0.9, height * 1.52);
      const bookHeight = Math.min(height * 0.78, bookWidth * 0.68);
      const left = (width - bookWidth) / 2;
      const top = (height - bookHeight) / 2;
      const pageWidth = bookWidth / 2;
      const index = this.currentSpread * 2 + (direction > 0 ? 1 : 0);
      const item = items[index];
      const panelWidth = Math.max(1, pageWidth * (1 - progress));
      const panelX = direction > 0 ? left + pageWidth : left + pageWidth - panelWidth;
      context.save();
      context.beginPath();
      context.rect(panelX, top, panelWidth, bookHeight);
      context.clip();
      this.drawPage(context, item, panelX, top, pageWidth, bookHeight, index + 1, direction < 0);
      const shade = context.createLinearGradient(panelX, 0, panelX + panelWidth, 0);
      shade.addColorStop(0, direction > 0 ? "rgba(23, 36, 32, 0.25)" : "rgba(255, 255, 255, 0.28)");
      shade.addColorStop(1, "rgba(23, 36, 32, 0.02)");
      context.fillStyle = shade;
      context.fillRect(panelX, top, panelWidth, bookHeight);
      context.restore();
    },
    drawImagePlaceholder: function _drawImagePlaceholder(context, x, y, width, height) {
      context.save();
      context.fillStyle = "#eee9de";
      context.fillRect(x, y, width, height);
      context.strokeStyle = "#d1c8b8";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x + width * 0.28, y + height * 0.68);
      context.lineTo(x + width * 0.48, y + height * 0.44);
      context.lineTo(x + width * 0.62, y + height * 0.57);
      context.lineTo(x + width * 0.72, y + height * 0.49);
      context.lineTo(x + width * 0.84, y + height * 0.68);
      context.stroke();
      context.fillStyle = "#c1b7a5";
      context.beginPath();
      context.arc(x + width * 0.38, y + height * 0.32, Math.max(4, height * 0.035), 0, Math.PI * 2);
      context.fill();
      context.restore();
    },
    getImage: function _getImage(url) {
      let image = this.imageCache.get(url);
      if (!image) {
        image = new Image();
        image.onload = () => this.renderBook();
        image.onerror = () => this.renderBook();
        image.src = url;
        this.imageCache.set(url, image);
      }
      return image;
    },
    wrapText: function _wrapText(context, text, maxWidth, maxLines) {
      const words = text.split(/\s+/);
      const lines = [];
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && context.measureText(candidate).width > maxWidth) {
          lines.push(line);
          line = word;
          if (lines.length === maxLines) {
            break;
          }
        } else {
          line = candidate;
        }
      }
      if (line && lines.length < maxLines) {
        lines.push(line);
      }
      if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
        lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S*$/, "")}…`;
      }
      return lines;
    },
    toApiDate: function _toApiDate(date, endOfDay) {
      const compactDate = date.replaceAll("-", "");
      return `${compactDate}${endOfDay ? "235959" : "000000"}`;
    },
    formatTimestamp: function _formatTimestamp(timestamp) {
      if (!timestamp || timestamp.length < 8) {
        return "";
      }
      return `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`;
    }
  });
  return Main;
});
//# sourceMappingURL=Main-dbg.controller.js.map
