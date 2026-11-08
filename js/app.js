/* ==========================================================================
   RADAR 竞赛中枢 · 交互逻辑
   数据驱动：data/data.json -> 渲染总览、比赛库、日历、关注、洞察
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const PAGE_SIZE = 8;
    const TARGET_TOTAL = 84;

    const PAGE_TITLES = {
        "page-home": "总览",
        "page-library": "比赛库",
        "page-calendar": "日历",
        "page-guide": "备赛攻略",
        "page-awards": "获奖墙",
        "page-follow": "我的关注",
        "page-insight": "数据洞察"
    };

    const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    const MONTHS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

    /* 深链接：/#/library、/#/insight 等 */
    const PAGE_SLUGS = {
        "": "page-home",
        "home": "page-home",
        "library": "page-library",
        "calendar": "page-calendar",
        "guide": "page-guide",
        "awards": "page-awards",
        "follow": "page-follow",
        "insight": "page-insight"
    };
    const PAGE_URLS = {
        "page-home": "home",
        "page-library": "library",
        "page-calendar": "calendar",
        "page-guide": "guide",
        "page-awards": "awards",
        "page-follow": "follow",
        "page-insight": "insight"
    };

    const KIND_CLASS = {
        "报名开始": "kind-sign-start",
        "报名截止": "kind-sign-end",
        "比赛": "kind-comp"
    };

    const CATEGORY_THUMB = {
        "计算机": "计",
        "创新创业": "创",
        "数学": "数",
        "工程硬件": "工",
        "艺术设计": "艺",
        "外语": "外",
        "理科": "理",
        "综合": "综"
    };

    const CATEGORY_CLASS = {
        "计算机": "cat-computer",
        "创新创业": "cat-venture",
        "数学": "cat-math",
        "工程硬件": "cat-engineering",
        "艺术设计": "cat-art",
        "外语": "cat-language",
        "理科": "cat-science",
        "综合": "cat-general"
    };

    const CATEGORY_COVER = {
        "计算机": "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=1600&q=80",
        "创新创业": "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1600&q=80",
        "数学": "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1600&q=80",
        "工程硬件": "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=80",
        "艺术设计": "https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=1600&q=80",
        "外语": "https://images.unsplash.com/photo-1439066615861-d1af74d74000?auto=format&fit=crop&w=1600&q=80",
        "理科": "https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=1600&q=80",
        "综合": "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1600&q=80",
        "default": "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1600&q=80"
    };

    const STORAGE_KEY = "radar.follows.v1";

    const state = {
        all: [],
        filtered: [],
        sourceCount: 0,
        page: 1,
        category: "全部",
        level: "全部",
        month: "全部",
        keyword: "",
        calendarCursor: new Date(2024, 9, 1),
        spotlightPool: [],
        spotlightIndex: 0
    };

    let charts = null;
    let lastFocused = null;

    const $ = id => document.getElementById(id);

    /* ----------------------------------------------------------------------
       启动
       ---------------------------------------------------------------------- */
    initDate();
    bindEvents();
    loadData();

    async function loadData() {
        try {
            const response = await fetch("./data/data.json", { cache: "no-store" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const rows = await response.json();
            if (!Array.isArray(rows) || !rows.length) throw new Error("数据为空");

            state.sourceCount = rows.length;
            state.all = expandRows(rows);
            loadFollows();
            state.spotlightPool = featuredPool();
            state.spotlightIndex = 0;
            state.calendarCursor = initialCalendarCursor();

            updateNavCounts();
            updateMetrics();
            renderStats();
            applyFilter();
            renderSpotlight();
            renderHomeUpcoming();
            renderFollows();
            renderCalendar();
            fillTrackCounts();
            renderCategoryBars();

            const initialPage = pageFromLocation();
            if (initialPage !== "page-home") switchPage(initialPage, { syncUrl: false });
        } catch (error) {
            renderLoadError();
        }
    }

    function expandRows(rows) {
        const all = rows.map(row => ({ ...row }));
        let generated = 0;
        while (all.length < TARGET_TOTAL) {
            generated += 1;
            const seed = rows[generated % rows.length];
            all.push({
                ...seed,
                id: 1000 + generated,
                name: `全国大学生学科竞赛（分类赛区 ${generated}）`,
                level: "省级",
                status: "未参与"
            });
        }
        return all;
    }

    function loadFollows() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const ids = new Set(JSON.parse(raw));
            if (!ids.size) return;
            state.all.forEach(item => {
                if (ids.has(item.id)) item.status = "关注";
            });
        } catch (error) {
            /* 隐私模式或禁用存储时忽略 */
        }
    }

    function saveFollows() {
        try {
            const ids = state.all.filter(item => item.status === "关注").map(item => item.id);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
        } catch (error) {
            /* 忽略写入失败 */
        }
    }

    function safeUrl(url) {
        const value = String(url || "").trim();
        if (!value || value === "#") return "#";
        try {
            const parsed = new URL(value, location.href);
            return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "#";
        } catch (error) {
            return "#";
        }
    }

    /* ----------------------------------------------------------------------
       工具函数
       ---------------------------------------------------------------------- */
    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[char]));
    }

    function pad2(value) {
        return String(value).padStart(2, "0");
    }

    function statusMeta(status) {
        if (status === "关注") return { cls: "status-open", label: "已关注" };
        if (status === "参与") return { cls: "status-live", label: "参赛中" };
        if (status === "已结束") return { cls: "status-closed", label: "已结束" };
        return { cls: "status-idle", label: "未报名" };
    }

    function levelClass(level) {
        if (level === "国家级") return "tag-national";
        if (level === "国际级") return "tag-intl";
        return "tag-provincial";
    }

    function categoryClass(category) {
        return CATEGORY_CLASS[category] || "cat-general";
    }

    function categoryThumb(category) {
        return CATEGORY_THUMB[category] || "赛";
    }

    function coverFor(category) {
        return CATEGORY_COVER[category] || CATEGORY_COVER.default;
    }

    function extractDates(text) {
        const matches = String(text || "").match(/\d{4}-\d{2}-\d{2}/g) || [];
        return matches.map(stamp => {
            const [year, month, day] = stamp.split("-").map(Number);
            return new Date(year, month - 1, day);
        });
    }

    function formatDate(date) {
        if (!date) return "—";
        return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
    }

    function formatShort(date) {
        if (!date) return "—";
        return `${date.getFullYear()}.${pad2(date.getMonth() + 1)}.${pad2(date.getDate())}`;
    }

    function formatRange(text) {
        const dates = extractDates(text);
        if (dates.length >= 2) {
            const [start, end] = dates;
            if (start.getFullYear() !== end.getFullYear()) {
                return `${start.getFullYear()}.${pad2(start.getMonth() + 1)} – ${end.getFullYear()}.${pad2(end.getMonth() + 1)}`;
            }
            return `${pad2(start.getMonth() + 1)}.${pad2(start.getDate())} – ${pad2(end.getMonth() + 1)}.${pad2(end.getDate())}`;
        }
        if (dates.length === 1) return formatShort(dates[0]);
        return text || "—";
    }

    function compDate(item) {
        return extractDates(item.compTime)[0] || extractDates(item.signTime)[0] || null;
    }

    function eventPoints(item) {
        const sign = extractDates(item.signTime);
        const comp = extractDates(item.compTime);
        const points = [];
        if (sign[0]) points.push({ date: sign[0], kind: "报名开始" });
        if (sign[1]) points.push({ date: sign[1], kind: "报名截止" });
        if (comp[0]) points.push({ date: comp[0], kind: "比赛" });
        return points;
    }

    function statusBadge(meta) {
        return `<span class="status-badge ${meta.cls}"><i></i>${meta.label}</span>`;
    }

    function emptyMarkup(title, hint, dark = false) {
        return `<div class="empty${dark ? " empty--dark" : ""}"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(hint)}</span></div>`;
    }

    /* ----------------------------------------------------------------------
       日期与导航
       ---------------------------------------------------------------------- */
    function initDate() {
        const now = new Date();
        const target = $("page-date");
        if (target) {
            target.textContent = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 · ${WEEKDAYS[now.getDay()]}`;
        }
    }

    function initialCalendarCursor() {
        const points = [];
        state.all.filter(item => item.id < 1000).forEach(item => {
            eventPoints(item).forEach(point => points.push(point.date));
        });
        if (!points.length) return new Date();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        points.sort((a, b) => a - b);
        const upcoming = points.find(date => date >= today);
        const target = upcoming || points[0];
        return new Date(target.getFullYear(), target.getMonth(), 1);
    }

    function pageFromLocation() {
        const rawHash = decodeURIComponent((location.hash || "").replace(/^#\/?/, "")).trim();
        const queryPage = new URLSearchParams(location.search).get("page") || "";
        return PAGE_SLUGS[rawHash || queryPage] || "page-home";
    }

    function syncUrl(pageId) {
        const next = `#/${PAGE_URLS[pageId] || "home"}`;
        if (location.hash === next) return;
        try {
            history.replaceState(null, "", next);
        } catch (error) {
            /* file:// 或受限环境下忽略 */
        }
    }

    /* ----------------------------------------------------------------------
       数据渲染
       ---------------------------------------------------------------------- */
    function featuredPool() {
        const rank = status => (status === "关注" ? 0 : status === "参与" ? 1 : 2);
        return state.all
            .filter(item => item.id < 1000)
            .sort((a, b) => rank(a.status) - rank(b.status) || a.id - b.id);
    }

    function updateNavCounts() {
        const all = $("nav-count-all");
        const follow = $("nav-count-follow");
        if (all) all.textContent = state.all.length;
        if (follow) follow.textContent = state.all.filter(item => item.status === "关注").length;
    }

    function updateMetrics() {
        const total = state.all.length;
        const open = state.all.filter(item => item.status === "关注" || item.status === "参与").length;
        const national = state.all.filter(item => item.level === "国家级").length;

        if ($("total-count")) $("total-count").textContent = total;
        if ($("metric-open")) $("metric-open").textContent = open;
        if ($("metric-national")) $("metric-national").textContent = national;
        if ($("home-follow-count")) $("home-follow-count").textContent = `${open} 场`;
        updateNavCounts();
    }

    function renderStats() {
        const total = state.all.length || 1;
        const open = state.all.filter(item => item.status === "关注" || item.status === "参与").length;
        const national = state.all.filter(item => item.level === "国家级").length;
        const provincial = state.all.filter(item => item.level === "省级").length;
        const intl = state.all.filter(item => item.level === "国际级").length;
        const categories = new Set(state.all.map(item => item.category).filter(Boolean)).size;
        const percent = value => `${Math.round((value / total) * 100)}% 占比`;

        if ($("stat-total")) $("stat-total").textContent = state.all.length;
        if ($("stat-total-chip")) $("stat-total-chip").textContent = `${state.sourceCount} 条源数据`;
        if ($("stat-note")) $("stat-note").textContent = `演示扩展至 ${state.all.length} 条 · 覆盖 ${categories} 个类别`;

        if ($("stat-open")) $("stat-open").textContent = open;
        if ($("stat-open-chip")) $("stat-open-chip").textContent = percent(open);

        if ($("stat-national")) $("stat-national").textContent = national;
        if ($("stat-national-chip")) $("stat-national-chip").textContent = `国际级 ${intl}`;
        if ($("stat-provincial")) $("stat-provincial").textContent = `省级 ${provincial} 项`;

        if ($("stat-provincial-value")) $("stat-provincial-value").textContent = provincial;
        if ($("stat-provincial-chip")) $("stat-provincial-chip").textContent = percent(provincial);
        if ($("stat-category-note")) $("stat-category-note").textContent = `包含 ${categories} 个竞赛类别`;

        renderSpark("spark-total", monthlySeries(() => true));
        renderSpark("spark-open", monthlySeries(item => item.status === "关注" || item.status === "参与"));
        renderSpark("spark-national", monthlySeries(item => item.level === "国家级"));
        renderSpark("spark-provincial", monthlySeries(item => item.level === "省级"));
    }

    function monthlySeries(predicate) {
        const counts = new Array(12).fill(0);
        state.all
            .filter(item => item.id < 1000)
            .filter(predicate)
            .forEach(item => {
                const date = compDate(item);
                if (date) counts[date.getMonth()] += 1;
            });
        return counts;
    }

    function renderSpark(id, counts) {
        const mount = $(id);
        if (!mount) return;
        const max = Math.max(...counts, 1);
        mount.innerHTML = counts.map((value, index) => {
            const height = 5 + Math.round((value / max) * 26);
            const peak = value > 0 && value === max ? " is-peak" : "";
            return `<span class="${peak.trim()}" style="height:${height}px" title="${index + 1}月 · ${value} 项"></span>`;
        }).join("");
    }

    function fillTrackCounts() {
        document.querySelectorAll(".track-count").forEach(node => {
            const category = node.dataset.count;
            const count = state.all.filter(item => item.category === category).length;
            node.textContent = `${count} 场`;
        });
    }

    function renderCategoryBars() {
        const mount = $("category-bars");
        if (!mount) return;

        const counts = new Map();
        state.all.forEach(item => {
            if (!item.category) return;
            counts.set(item.category, (counts.get(item.category) || 0) + 1);
        });

        const rows = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
        const max = Math.max(...rows.map(row => row[1]), 1);
        const total = state.all.length || 1;

        const counter = $("category-count");
        if (counter) counter.textContent = `${rows.length} 个类别`;

        mount.innerHTML = rows.map(([category, count]) => {
            const width = Math.max((count / max) * 100, 4);
            const percent = Math.round((count / total) * 100);
            return `
                <div class="cat-row">
                    <span class="cat-name"><i aria-hidden="true"></i>${escapeHtml(category)}</span>
                    <span class="cat-track"><span class="cat-fill" style="width:${width.toFixed(1)}%"></span></span>
                    <span class="cat-val">${count}<em>${percent}%</em></span>
                </div>
            `;
        }).join("");
    }
    /* ----------------------------------------------------------------------
       焦点赛事
       ---------------------------------------------------------------------- */
    function renderSpotlight() {
        const pool = state.spotlightPool;
        if (!pool.length) return;
        const index = ((state.spotlightIndex % pool.length) + pool.length) % pool.length;
        state.spotlightIndex = index;
        const item = pool[index];

        $("spotlight-name").textContent = item.name;
        $("spotlight-host").textContent = `${item.host || "主办方待补充"} · ${item.category}`;
        $("spotlight-sign").textContent = formatRange(item.signTime);
        $("spotlight-comp").textContent = formatShort(compDate(item));
        $("spotlight-index").textContent = `${pad2(index + 1)} / ${pad2(pool.length)}`;

        const badge = $("spotlight-status");
        const meta = statusMeta(item.status);
        badge.className = `status-badge ${meta.cls}`;
        badge.innerHTML = `<i></i>${meta.label}`;
    }

    function shiftSpotlight(step) {
        if (!state.spotlightPool.length) return;
        state.spotlightIndex += step;
        renderSpotlight();
        const card = $("spotlight-card");
        if (card && typeof card.animate === "function") {
            card.animate(
                [
                    { opacity: 0.55, transform: "translateY(5px)" },
                    { opacity: 1, transform: "none" }
                ],
                { duration: 280, easing: "cubic-bezier(0.22,0.72,0.28,1)" }
            );
        }
    }

    /* ----------------------------------------------------------------------
       比赛库表格
       ---------------------------------------------------------------------- */
    function rowMarkup(item) {
        const meta = statusMeta(item.status);
        const marked = item.status === "关注";
        const name = escapeHtml(item.name);
        const website = escapeHtml(safeUrl(item.website));
        return `
            <div class="list-row" data-id="${item.id}" role="row" tabindex="0" aria-label="${name}">
                <div class="cell-name" role="cell">
                    <span class="row-thumb ${categoryClass(item.category)}" aria-hidden="true">${escapeHtml(categoryThumb(item.category))}</span>
                    <div class="cell-text">
                        <h3>${name}</h3>
                        <div class="tags">
                            <span class="tag ${levelClass(item.level)}">${escapeHtml(item.level)}</span>
                            <span class="tag tag-cat">${escapeHtml(item.category)}</span>
                        </div>
                    </div>
                </div>
                <p class="cell-host" role="cell">${escapeHtml(item.host || "—")}</p>
                <div class="cell-time" role="cell">
                    <span><em>报名</em>${escapeHtml(formatRange(item.signTime))}</span>
                    <span><em>比赛</em>${escapeHtml(formatShort(extractDates(item.compTime)[0]))}</span>
                </div>
                <span class="status-badge ${meta.cls}" role="cell"><i></i>${meta.label}</span>
                <div class="col-action" role="cell">
                    <a class="link-btn" href="${website}" target="_blank" rel="noopener">官网</a>
                    <button class="mark-btn ${marked ? "marked" : ""}" type="button" data-mark="${item.id}" aria-pressed="${marked}">${marked ? "已关注" : "关注"}</button>
                </div>
            </div>
        `;
    }

    function bindRowClicks(container) {
        container.querySelectorAll(".list-row").forEach(row => {
            const open = () => {
                const item = state.all.find(entry => entry.id === Number(row.dataset.id));
                if (item) openModal(item);
            };
            row.addEventListener("click", event => {
                if (event.target.closest("a, button")) return;
                open();
            });
            row.addEventListener("keydown", event => {
                if (event.target.closest("a, button")) return;
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    open();
                }
            });
        });
        container.querySelectorAll("[data-mark]").forEach(button => {
            button.addEventListener("click", event => toggleMark(Number(button.dataset.mark), event));
        });
    }

    function renderList() {
        const total = state.filtered.length;
        const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        if (state.page > pages) state.page = pages;
        const start = (state.page - 1) * PAGE_SIZE;
        const slice = state.filtered.slice(start, start + PAGE_SIZE);

        $("result-count").textContent = total
            ? `共 ${total} 条 · 当前显示 ${start + 1}–${start + slice.length}`
            : "没有符合条件的赛事";
        $("page-label").textContent = `第 ${state.page} / ${pages} 页`;
        $("page-prev").disabled = state.page <= 1;
        $("page-next").disabled = state.page >= pages;

        const list = $("library-list");
        if (!slice.length) {
            list.innerHTML = emptyMarkup("没有符合条件的赛事", "试着清空筛选，或换一个关键词。");
        } else {
            list.innerHTML = slice.map(rowMarkup).join("");
            bindRowClicks(list);
        }

        renderPager(pages);
        updateFilterHint();
    }

    function pageSequence(current, total) {
        if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
        const pages = new Set([1, total, current, current - 1, current + 1]);
        if (current <= 3) [2, 3, 4].forEach(page => pages.add(page));
        if (current >= total - 2) [total - 1, total - 2, total - 3].forEach(page => pages.add(page));
        const sorted = [...pages].filter(page => page >= 1 && page <= total).sort((a, b) => a - b);
        const output = [];
        sorted.forEach((page, index) => {
            if (index && page - sorted[index - 1] > 1) output.push("…");
            output.push(page);
        });
        return output;
    }

    function renderPager(pages) {
        const mount = $("pager-pages");
        if (!mount) return;
        mount.innerHTML = pageSequence(state.page, pages).map(page => {
            if (page === "…") return `<span class="page-ellipsis" aria-hidden="true">…</span>`;
            const active = page === state.page;
            return `<button class="page-num ${active ? "active" : ""}" type="button" data-goto="${page}" aria-label="第 ${page} 页"${active ? ' aria-current="page"' : ""}>${page}</button>`;
        }).join("");

        mount.querySelectorAll("[data-goto]").forEach(button => {
            button.addEventListener("click", () => {
                const page = Number(button.dataset.goto);
                if (page === state.page) return;
                state.page = page;
                renderList();
            });
        });
    }

    function updateFilterHint() {
        const active = state.category !== "全部" || state.level !== "全部" || state.month !== "全部" || Boolean(state.keyword);
        const hint = $("filter-hint");
        if (hint) {
            hint.textContent = active
                ? `已筛选 ${state.filtered.length} / ${state.all.length} 条`
                : "按类别、级别与月份收窄范围";
        }
    }

    function renderFollows() {
        const followed = state.all.filter(item => item.status === "关注");
        $("follow-count").textContent = followed.length
            ? `已关注 ${followed.length} 场，点一行查看详情。`
            : "还没有关注的赛事，可以在比赛库里点「关注」。";

        const mount = $("follow-list");
        mount.innerHTML = followed.length
            ? followed.map(rowMarkup).join("")
            : emptyMarkup("关注列表是空的", "在比赛库或赛事详情里点「关注」，就会出现在这里。");
        if (followed.length) bindRowClicks(mount);
    }

    function renderHomeUpcoming() {
        const rows = state.spotlightPool
            .filter(item => item.status === "关注" || item.status === "参与")
            .slice(0, 4);
        const mount = $("home-upcoming");

        if (!rows.length) {
            mount.innerHTML = emptyMarkup(
                "还没有正在跟进的赛事",
                "去比赛库点几场「关注」，它们会排在这里。",
                true
            );
            return;
        }

        mount.innerHTML = rows.map(item => {
            const meta = statusMeta(item.status);
            const date = compDate(item);
            return `
                <button class="upcoming-row" type="button" data-id="${item.id}">
                    <span class="upcoming-mark" aria-hidden="true">${escapeHtml(categoryThumb(item.category))}</span>
                    <span class="upcoming-main">
                        <strong>${escapeHtml(item.name)}</strong>
                        <em>${escapeHtml(item.host || "主办方待补充")} · ${escapeHtml(item.level)} · ${escapeHtml(item.category)}</em>
                    </span>
                    <span class="upcoming-time">
                        <em>比赛日</em>
                        <time>${escapeHtml(date ? formatShort(date) : "待定")}</time>
                    </span>
                    ${statusBadge(meta)}
                    <span class="row-chev" aria-hidden="true">
                        <svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>
                    </span>
                </button>
            `;
        }).join("");

        mount.querySelectorAll(".upcoming-row").forEach(button => {
            button.addEventListener("click", () => {
                const item = state.all.find(entry => entry.id === Number(button.dataset.id));
                if (item) openModal(item);
            });
        });
    }

    /* ----------------------------------------------------------------------
       筛选
       ---------------------------------------------------------------------- */
    function applyFilter() {
        state.filtered = state.all.filter(item => {
            const matchCategory = state.category === "全部" || item.category === state.category;
            const matchLevel = state.level === "全部" || item.level === state.level;
            const haystack = `${item.name || ""} ${item.host || ""} ${item.intro || ""}`.toLowerCase();
            const matchKeyword = haystack.includes(state.keyword);
            let matchMonth = true;
            if (state.month !== "全部") {
                const month = state.month.padStart(2, "0");
                matchMonth = String(item.signTime).includes(`-${month}-`) || String(item.compTime).includes(`-${month}-`);
            }
            return matchCategory && matchLevel && matchKeyword && matchMonth;
        });
        renderList();
    }

    function resetFilters() {
        state.category = "全部";
        state.level = "全部";
        state.month = "全部";
        state.keyword = "";
        state.page = 1;
        $("search-input").value = "";
        $("filter-month").value = "全部";
        document.querySelectorAll(".filter-btn").forEach(button => {
            button.classList.toggle("active", button.dataset.val === "全部");
        });
        applyFilter();
    }

    function openTrack(category) {
        state.category = category;
        state.level = "全部";
        state.month = "全部";
        state.keyword = "";
        state.page = 1;
        $("search-input").value = "";
        $("filter-month").value = "全部";
        document.querySelectorAll('.filter-btn[data-type="category"]').forEach(button => {
            button.classList.toggle("active", button.dataset.val === category);
        });
        document.querySelectorAll('.filter-btn[data-type="level"]').forEach(button => {
            button.classList.toggle("active", button.dataset.val === "全部");
        });
        applyFilter();
        switchPage("page-library");
    }

    /* ----------------------------------------------------------------------
       日历与时间轴
       ---------------------------------------------------------------------- */
    function renderCalendar() {
        const cursor = state.calendarCursor;
        const year = cursor.getFullYear();
        const month = cursor.getMonth();
        $("cal-label").textContent = `${year}年${month + 1}月`;

        const firstWeekday = new Date(year, month, 1).getDay();
        const days = new Date(year, month + 1, 0).getDate();
        const today = new Date();
        const byDay = {};

        state.all.filter(item => item.id < 1000).forEach(item => {
            eventPoints(item).forEach(point => {
                if (point.date.getFullYear() === year && point.date.getMonth() === month) {
                    const key = point.date.getDate();
                    byDay[key] = byDay[key] || [];
                    byDay[key].push({ item, kind: point.kind });
                }
            });
        });

        let html = "";
        for (let index = 0; index < firstWeekday; index += 1) {
            html += `<div class="cal-cell is-empty" aria-hidden="true"></div>`;
        }
        for (let day = 1; day <= days; day += 1) {
            const events = byDay[day] || [];
            const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
            const pills = events.slice(0, 2).map(event => {
                const kindClass = KIND_CLASS[event.kind] || "kind-comp";
                return `<button class="cal-pill ${kindClass}" type="button" data-id="${event.item.id}" title="${escapeHtml(event.item.name)}">${escapeHtml(event.kind)}</button>`;
            }).join("");
            const more = events.length > 2 ? `<span class="cal-more">+${events.length - 2}</span>` : "";
            html += `<div class="cal-cell ${events.length ? "has-event" : ""} ${isToday ? "is-today" : ""}">
                <span class="cal-day">${day}</span>${pills}${more}
            </div>`;
        }

        const grid = $("cal-grid");
        grid.innerHTML = html;
        grid.querySelectorAll(".cal-pill").forEach(pill => {
            pill.addEventListener("click", () => {
                const item = state.all.find(entry => entry.id === Number(pill.dataset.id));
                if (item) openModal(item);
            });
        });

        const timeline = state.all
            .filter(item => item.id < 1000)
            .map(item => ({ item, comp: extractDates(item.compTime)[0] }))
            .filter(entry => entry.comp)
            .sort((a, b) => a.comp - b.comp)
            .slice(0, 8);

        $("timeline-list").innerHTML = timeline.map(entry => `
            <button class="time-row" type="button" data-id="${entry.item.id}">
                <span class="time-tag">${entry.comp.getFullYear()}.${pad2(entry.comp.getMonth() + 1)}</span>
                <span>
                    <strong>${escapeHtml(entry.item.name)}</strong>
                    <em>${escapeHtml(entry.item.level)} · ${statusMeta(entry.item.status).label}</em>
                </span>
            </button>
        `).join("");

        document.querySelectorAll("#timeline-list .time-row").forEach(button => {
            button.addEventListener("click", () => {
                const item = state.all.find(entry => entry.id === Number(button.dataset.id));
                if (item) openModal(item);
            });
        });
    }

    /* ----------------------------------------------------------------------
       ECharts
       ---------------------------------------------------------------------- */
    function ensureCharts() {
        if (charts) return charts;
        if (typeof echarts === "undefined") {
            ["chart-ring-green", "chart-ring-blue", "chart-ring-orange", "chart-bar"].forEach(id => {
                const node = $(id);
                if (node) node.innerHTML = `<div class="empty"><strong>图表组件未加载</strong><span>请检查网络后刷新页面。</span></div>`;
            });
            return null;
        }

        const init = id => {
            const node = $(id);
            if (!node) return null;
            return echarts.init(node, null, { renderer: "canvas" });
        };

        const green = init("chart-ring-green");
        const blue = init("chart-ring-blue");
        const orange = init("chart-ring-orange");
        const bar = init("chart-bar");
        if (!green || !blue || !orange || !bar) return null;

        charts = { green, blue, orange, bar };

        const gradient = (from, to) => new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: from },
            { offset: 1, color: to }
        ]);

        bar.setOption({
            animationDuration: 650,
            tooltip: {
                trigger: "axis",
                axisPointer: { type: "shadow", shadowStyle: { color: "rgba(15, 118, 110, 0.06)" } },
                backgroundColor: "#0b2230",
                borderWidth: 0,
                padding: [9, 13],
                textStyle: { color: "#eaf3f7", fontSize: 11.5 },
                extraCssText: "border-radius:10px;box-shadow:0 18px 40px -18px rgba(0,0,0,.65);"
            },
            grid: { left: 4, right: 8, bottom: 4, top: 22, containLabel: true },
            xAxis: {
                type: "category",
                data: MONTHS,
                axisLabel: { color: "#7f94a6", fontSize: 10.5 },
                axisLine: { lineStyle: { color: "#e1e8ef" } },
                axisTick: { show: false }
            },
            yAxis: {
                type: "value",
                minInterval: 1,
                axisLabel: { color: "#7f94a6", fontSize: 10.5 },
                splitLine: { lineStyle: { color: "#edf2f7" } }
            },
            series: [{
                type: "bar",
                name: "赛事数量",
                data: new Array(12).fill(0),
                barWidth: "46%",
                itemStyle: {
                    borderRadius: [7, 7, 3, 3],
                    color: gradient("#1aa79b", "#0b5f68")
                },
                emphasis: {
                    itemStyle: { color: gradient("#38c3b3", "#0f766e") }
                }
            }]
        });

        bar.on("click", params => {
            state.month = String(params.dataIndex + 1);
            $("filter-month").value = state.month;
            state.page = 1;
            applyFilter();
            switchPage("page-library");
        });

        window.addEventListener("resize", debounce(resizeCharts, 140));
        return charts;
    }

    function paintRing(chart, value, label, color) {
        if (!chart) return;
        const total = state.all.length || 1;
        const rest = Math.max(total - value, 0);
        chart.setOption({
            animationDuration: 650,
            color: [color, "#eef3f8"],
            series: [{
                type: "pie",
                radius: ["66%", "88%"],
                center: ["50%", "50%"],
                avoidLabelOverlap: false,
                silent: true,
                itemStyle: { borderColor: "#ffffff", borderWidth: 3, borderRadius: 6 },
                label: {
                    show: true,
                    position: "center",
                    formatter: `{a|${value}}\n{b|${label}}`,
                    rich: {
                        a: { fontSize: 23, fontWeight: "bold", color: "#0a1a26", lineHeight: 29 },
                        b: { fontSize: 10.5, color: "#7f94a6", padding: [4, 0, 0, 0] }
                    }
                },
                labelLine: { show: false },
                data: [
                    { value, name: label, itemStyle: { color } },
                    { value: rest, name: "其他", itemStyle: { color: "#eef3f8" } }
                ]
            }]
        });
    }

    function updateCharts() {
        if (!charts) return;
        const open = state.all.filter(item => item.status === "关注" || item.status === "参与").length;
        const national = state.all.filter(item => item.level === "国家级").length;
        const provincial = state.all.filter(item => item.level === "省级").length;

        paintRing(charts.green, open, "跟进中", "#0f766e");
        paintRing(charts.blue, national, "国家级", "#1f5f9e");
        paintRing(charts.orange, provincial, "省级", "#92610f");

        const counts = new Array(12).fill(0);
        state.all.filter(item => item.id < 1000).forEach(item => {
            const date = compDate(item);
            if (date) counts[date.getMonth()] += 1;
        });
        charts.bar.setOption({ series: [{ data: counts }] });
    }

    function resizeCharts() {
        if (!charts) return;
        Object.values(charts).forEach(chart => chart && chart.resize());
    }

    function debounce(fn, delay) {
        let timer = 0;
        return (...args) => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => fn(...args), delay);
        };
    }

    /* ----------------------------------------------------------------------
       页面切换与顶栏
       ---------------------------------------------------------------------- */
    function switchPage(pageId, options = {}) {
        document.querySelectorAll(".route-btn").forEach(button => {
            const active = button.dataset.page === pageId;
            button.classList.toggle("active", active);
            if (active) button.setAttribute("aria-current", "page");
            else button.removeAttribute("aria-current");
        });

        document.querySelectorAll(".page-view").forEach(page => {
            page.classList.toggle("active", page.id === pageId);
        });

        const title = PAGE_TITLES[pageId] || "竞赛中枢";
        $("page-title").textContent = title;
        updateTopCta(pageId);
        closeNav();

        const scroller = document.querySelector(".workspace-scroll");
        if (scroller) scroller.scrollTop = 0;

        if (pageId === "page-insight") {
            const paint = () => {
                if (ensureCharts()) {
                    updateCharts();
                    resizeCharts();
                }
            };
            requestAnimationFrame(paint);
            window.setTimeout(paint, 140);
        }

        if (options.syncUrl !== false) syncUrl(pageId);
    }

    function updateTopCta(pageId) {
        const toHome = pageId !== "page-home";
        $("top-cta-label").textContent = toHome ? "回到总览" : "浏览比赛库";
        $("top-cta").dataset.target = toHome ? "page-home" : "page-library";
    }

    /* ----------------------------------------------------------------------
       弹窗
       ---------------------------------------------------------------------- */
    function openModal(item) {
        const modal = $("global-modal");
        const sheet = modal.querySelector(".detail-sheet");
        if (!modal.classList.contains("show")) lastFocused = document.activeElement;

        const meta = statusMeta(item.status);
        $("modal-kicker").textContent = `${item.level} · ${item.category}`;
        $("modal-title").textContent = item.name;
        $("modal-intro").textContent = item.intro || "这场赛事暂时没有简介，可以先去官网看看。";

        $("modal-chips").innerHTML = [item.level, item.category, meta.label]
            .map(text => `<span class="chip">${escapeHtml(text)}</span>`)
            .join("");

        $("modal-cover").style.backgroundImage = [
            "linear-gradient(180deg, rgba(3,13,19,0.2) 0%, rgba(3,13,19,0.62) 46%, rgba(7,22,31,0.98) 100%)",
            "linear-gradient(100deg, rgba(3,13,19,0.82) 0%, rgba(3,13,19,0.24) 62%, rgba(3,13,19,0.5) 100%)",
            `url("${coverFor(item.category)}")`
        ].join(", ");

        const sign = extractDates(item.signTime);
        const comp = extractDates(item.compTime);
        const steps = [
            ["报名开始", sign[0] ? formatDate(sign[0]) : item.signTime || "见报名说明"],
            ["报名截止", sign[1] ? formatDate(sign[1]) : "见报名说明"],
            ["比赛日", comp[0] ? formatDate(comp[0]) : item.compTime || "待公布"]
        ];
        $("modal-timeline").innerHTML = steps.map(([label, value]) => `
            <div class="step">
                <i aria-hidden="true"></i>
                <div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
            </div>
        `).join("");

        $("modal-facts").innerHTML = `
            <div><span>主办方</span><strong>${escapeHtml(item.host || "—")}</strong></div>
            <div><span>赛事级别</span><strong>${escapeHtml(item.level)}</strong></div>
            <div><span>所属类别</span><strong>${escapeHtml(item.category)}</strong></div>
            <div><span>当前状态</span><strong>${meta.label}</strong></div>
            <div class="fact-block"><span>赛事简介</span><strong>${escapeHtml(item.intro || "暂无简介")}</strong></div>
        `;

        const site = $("modal-site");
        const safeSite = safeUrl(item.website);
        site.href = safeSite;
        if (safeSite === "#") site.setAttribute("aria-disabled", "true");
        else site.removeAttribute("aria-disabled");

        const followBtn = $("modal-follow");
        const marked = item.status === "关注";
        followBtn.textContent = marked ? "已关注" : "关注这场比赛";
        followBtn.classList.toggle("is-on", marked);
        followBtn.onclick = event => toggleMark(item.id, event);

        const alreadyOpen = modal.classList.contains("show");
        modal.classList.add("show");
        modal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
        if (!alreadyOpen) {
            requestAnimationFrame(() => sheet.focus({ preventScroll: true }));
        }
    }

    function closeModal() {
        const modal = $("global-modal");
        if (!modal.classList.contains("show")) return;
        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
        if (lastFocused && typeof lastFocused.focus === "function") {
            lastFocused.focus({ preventScroll: true });
        }
        lastFocused = null;
    }

    function toggleMark(id, event) {
        if (event) event.stopPropagation();
        const item = state.all.find(entry => entry.id === id);
        if (!item) return;

        const marked = item.status === "关注";
        item.status = marked ? "未参与" : "关注";
        saveFollows();

        state.spotlightPool = featuredPool();
        if (state.spotlightIndex >= state.spotlightPool.length) state.spotlightIndex = 0;

        renderList();
        renderFollows();
        renderSpotlight();
        renderHomeUpcoming();
        renderCalendar();
        updateMetrics();
        renderStats();
        updateCharts();

        const modal = $("global-modal");
        if (modal.classList.contains("show") && $("modal-title").textContent === item.name) {
            openModal(item);
        }
        showToast(marked ? "已取消关注" : "已加入我的关注");
    }

    function showToast(message) {
        const toast = $("global-toast");
        const text = $("toast-text");
        if (!toast || !text) return;
        text.textContent = message;
        toast.classList.add("show");
        window.clearTimeout(showToast.timer);
        showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2000);
    }

    /* ----------------------------------------------------------------------
       移动端导航
       ---------------------------------------------------------------------- */
    function openNav() {
        const shell = $("app-shell");
        shell.classList.add("nav-open");
        $("nav-toggle").setAttribute("aria-expanded", "true");
        document.body.style.overflow = "hidden";
    }

    function closeNav() {
        const shell = $("app-shell");
        if (!shell || !shell.classList.contains("nav-open")) return;
        shell.classList.remove("nav-open");
        $("nav-toggle").setAttribute("aria-expanded", "false");
        if (!$("global-modal").classList.contains("show")) document.body.style.overflow = "";
    }

    /* ----------------------------------------------------------------------
       事件绑定
       ---------------------------------------------------------------------- */
    function bindEvents() {
        document.querySelectorAll("[data-page]").forEach(button => {
            button.addEventListener("click", () => switchPage(button.dataset.page));
        });

        $("top-cta").addEventListener("click", event => {
            switchPage(event.currentTarget.dataset.target || "page-library");
        });

        $("hero-browse").addEventListener("click", () => switchPage("page-library"));
        $("hero-follow").addEventListener("click", () => switchPage("page-follow"));
        $("home-all").addEventListener("click", () => openTrack("全部"));

        $("spotlight-open").addEventListener("click", () => {
            const item = state.spotlightPool[state.spotlightIndex];
            if (item) openModal(item);
        });
        $("spotlight-prev").addEventListener("click", () => shiftSpotlight(-1));
        $("spotlight-next").addEventListener("click", () => shiftSpotlight(1));

        $("bell-btn").addEventListener("click", () => showToast("暂无新的赛事提醒"));

        document.querySelectorAll(".track-card").forEach(card => {
            card.addEventListener("click", () => openTrack(card.dataset.val));
        });

        document.querySelectorAll(".filter-btn").forEach(button => {
            button.addEventListener("click", () => {
                const type = button.dataset.type;
                const value = button.dataset.val;
                button.parentElement.querySelectorAll(".filter-btn").forEach(peer => peer.classList.remove("active"));
                button.classList.add("active");
                if (type === "category") state.category = value;
                if (type === "level") state.level = value;
                state.page = 1;
                applyFilter();
            });
        });

        $("filter-month").addEventListener("change", event => {
            state.month = event.target.value;
            state.page = 1;
            applyFilter();
        });

        $("filter-reset").addEventListener("click", resetFilters);

        $("search-input").addEventListener("input", event => {
            state.keyword = event.target.value.trim().toLowerCase();
            state.page = 1;
            applyFilter();
            if (state.keyword) switchPage("page-library");
        });

        $("page-prev").addEventListener("click", () => {
            if (state.page > 1) {
                state.page -= 1;
                renderList();
            }
        });

        $("page-next").addEventListener("click", () => {
            const pages = Math.ceil(state.filtered.length / PAGE_SIZE);
            if (state.page < pages) {
                state.page += 1;
                renderList();
            }
        });

        $("cal-prev").addEventListener("click", () => {
            state.calendarCursor = new Date(state.calendarCursor.getFullYear(), state.calendarCursor.getMonth() - 1, 1);
            renderCalendar();
        });

        $("cal-next").addEventListener("click", () => {
            state.calendarCursor = new Date(state.calendarCursor.getFullYear(), state.calendarCursor.getMonth() + 1, 1);
            renderCalendar();
        });

        const modal = $("global-modal");
        $("modal-close").addEventListener("click", closeModal);
        modal.addEventListener("click", event => {
            if (event.target === modal) closeModal();
        });

        modal.addEventListener("keydown", event => {
            if (event.key !== "Tab") return;
            const focusables = modal.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
            if (!focusables.length) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });

        $("nav-toggle").addEventListener("click", openNav);
        $("nav-close").addEventListener("click", closeNav);
        $("nav-scrim").addEventListener("click", closeNav);

        document.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                if (modal.classList.contains("show")) closeModal();
                else closeNav();
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                $("search-input").focus();
                $("search-input").select();
            }
        });

        window.addEventListener("resize", debounce(() => {
            if (window.innerWidth > 1024) closeNav();
        }, 160));

        window.addEventListener("hashchange", () => {
            switchPage(pageFromLocation(), { syncUrl: false });
        });
    }

    function renderLoadError() {
        const list = $("library-list");
        if (list) {
            list.innerHTML = emptyMarkup(
                "目录加载失败",
                "请用本地服务器打开项目（例如 VS Code Live Server），直接双击 HTML 会被浏览器的安全策略拦截。"
            );
        }
        if ($("result-count")) $("result-count").textContent = "数据未加载";
        if ($("stat-note")) $("stat-note").textContent = "无法读取 data/data.json";
    }
});
