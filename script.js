(function () {
    'use strict';

    // ---- THE FIX: Use window.innerHeight instead of 100vh ----
    // On iOS Safari, 100vh includes the area behind the URL bar and
    // home indicator. window.innerHeight gives the ACTUAL visible pixels.
    function setAppHeight() {
        document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
    }
    setAppHeight();
    window.addEventListener('resize', function () { setAppHeight(); });
    window.addEventListener('orientationchange', function () {
        setTimeout(setAppHeight, 100);
    });

    var STORAGE_KEY = 'dashboard_pages';

    var state = {
        pages: [],
        activePageId: null,
        sidebarOpen: false,
        editMode: false,
        editingPageId: null,
        tabPage: 0
    };

    var els = {
        sidebarTrigger: document.getElementById('sidebarTrigger'),
        overlay: document.getElementById('overlay'),
        sidebar: document.getElementById('sidebar'),
        closeSidebar: document.getElementById('closeSidebar'),
        urlName: document.getElementById('urlName'),
        urlInput: document.getElementById('urlInput'),
        addUrlBtn: document.getElementById('addUrlBtn'),
        pagesList: document.getElementById('pagesList'),
        editModeBtn: document.getElementById('editModeBtn'),
        canvas: document.getElementById('canvas'),
        emptyState: document.getElementById('emptyState'),
        iframeContainer: document.getElementById('iframeContainer'),
        tabsBar: document.getElementById('tabsBar'),
        tabsWindow: document.getElementById('tabsWindow'),
        tabArrowLeft: document.getElementById('tabArrowLeft'),
        tabArrowRight: document.getElementById('tabArrowRight'),
        editOverlay: document.getElementById('editOverlay'),
        editGrid: document.getElementById('editGrid'),
        doneEditBtn: document.getElementById('doneEditBtn'),
        editPageModal: document.getElementById('editPageModal'),
        editPageName: document.getElementById('editPageName'),
        editPageUrl: document.getElementById('editPageUrl'),
        closeEditModal: document.getElementById('closeEditModal'),
        cancelEditPage: document.getElementById('cancelEditPage'),
        saveEditPage: document.getElementById('saveEditPage'),
        toast: document.getElementById('toast')
    };

    function getTabsPerPage() {
        var w = window.innerWidth;
        if (w >= 1200) return 8;
        if (w >= 768) return 5;
        return 3;
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    function normalizeUrl(url) {
        url = url.trim();
        if (!url) return '';
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        return url;
    }

    function getDomain(url) {
        try { return new URL(url).hostname; }
        catch (e) { return url; }
    }

    function getInitial(name) {
        return (name || '?').charAt(0).toUpperCase();
    }

    function escapeHtml(str) {
        var d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    // ---- Storage ----

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                pages: state.pages,
                activePageId: state.activePageId
            }));
        } catch (e) {}
    }

    function loadState() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                var data = JSON.parse(raw);
                state.pages = data.pages || [];
                state.activePageId = data.activePageId || null;
                if (state.activePageId && !state.pages.find(function (p) { return p.id === state.activePageId; })) {
                    state.activePageId = state.pages.length > 0 ? state.pages[0].id : null;
                }
            }
        } catch (e) {
            state.pages = [];
            state.activePageId = null;
        }
    }

    // ---- Toast ----

    var toastTimer = null;
    function showToast(msg, type) {
        type = type || 'success';
        clearTimeout(toastTimer);
        els.toast.textContent = msg;
        els.toast.className = 'toast ' + type;
        void els.toast.offsetWidth;
        els.toast.classList.add('show');
        toastTimer = setTimeout(function () { els.toast.classList.remove('show'); }, 2500);
    }

    // ---- Confirm ----

    function showConfirm(title, message) {
        return new Promise(function (resolve) {
            var ov = document.createElement('div');
            ov.className = 'confirm-overlay';
            ov.innerHTML =
                '<div class="confirm-dialog"><h3>' + title + '</h3><p>' + message + '</p>' +
                '<div class="confirm-actions"><button class="confirm-cancel">Cancel</button>' +
                '<button class="confirm-delete">Remove</button></div></div>';
            document.body.appendChild(ov);
            function close(r) { ov.remove(); resolve(r); }
            ov.querySelector('.confirm-cancel').addEventListener('click', function () { close(false); });
            ov.querySelector('.confirm-delete').addEventListener('click', function () { close(true); });
            ov.addEventListener('click', function (e) { if (e.target === ov) close(false); });
        });
    }

    // ---- Sidebar ----

    function openSidebar() {
        state.sidebarOpen = true;
        els.sidebar.classList.add('open');
        els.overlay.classList.add('active');
        els.sidebarTrigger.classList.add('hidden');
    }

    function closeSidebar() {
        state.sidebarOpen = false;
        els.sidebar.classList.remove('open');
        els.overlay.classList.remove('active');
        els.sidebarTrigger.classList.remove('hidden');
    }

    // ---- Swipe ----

    var swSX = 0, swSY = 0, swT = 0, swA = false;
    document.addEventListener('touchstart', function (e) {
        var t = e.touches[0];
        swSX = t.clientX; swSY = t.clientY; swT = Date.now(); swA = false;
        if (!state.sidebarOpen && !state.editMode && swSX < 35) swA = true;
        if (state.sidebarOpen) swA = true;
    }, { passive: true });

    document.addEventListener('touchend', function (e) {
        if (!swA) return;
        var t = e.changedTouches[0];
        var dx = t.clientX - swSX, dy = Math.abs(t.clientY - swSY), dt = Date.now() - swT;
        if (dy > Math.abs(dx)) return;
        if (!state.sidebarOpen && dx > 60 && dt < 500) openSidebar();
        if (state.sidebarOpen && dx < -60 && dt < 500) closeSidebar();
        swA = false;
    }, { passive: true });

    // ---- Page CRUD ----

    function addPage(name, url) {
        var nu = normalizeUrl(url);
        if (!nu) { showToast('Please enter a valid URL', 'error'); return; }
        if (!name.trim()) name = getDomain(nu);
        if (state.pages.find(function (p) { return p.url === nu; })) {
            showToast('This URL already exists', 'error'); return;
        }
        var page = { id: generateId(), name: name.trim(), url: nu, addedAt: Date.now() };
        state.pages.push(page);
        state.activePageId = page.id;
        saveState();
        els.urlName.value = '';
        els.urlInput.value = '';
        ensureActiveTabPage();
        renderAll();
        closeSidebar();
        showToast(page.name + ' added');
    }

    function removePage(id) {
        var page = state.pages.find(function (p) { return p.id === id; });
        if (!page) return Promise.resolve();
        return showConfirm('Remove Website', 'Remove <strong>' + escapeHtml(page.name) + '</strong>?').then(function (ok) {
            if (!ok) return;
            state.pages = state.pages.filter(function (p) { return p.id !== id; });
            var w = document.querySelector('.iframe-wrapper[data-id="' + id + '"]');
            if (w) w.remove();
            if (state.activePageId === id)
                state.activePageId = state.pages.length > 0 ? state.pages[0].id : null;
            saveState();
            clampTabPage();
            renderAll();
            showToast(page.name + ' removed');
        });
    }

    function updatePage(id, newName, newUrl) {
        var page = state.pages.find(function (p) { return p.id === id; });
        if (!page) return false;
        var nu = normalizeUrl(newUrl);
        if (!nu) { showToast('Please enter a valid URL', 'error'); return false; }
        if (!newName.trim()) newName = getDomain(nu);
        if (state.pages.find(function (p) { return p.url === nu && p.id !== id; })) {
            showToast('This URL already exists', 'error'); return false;
        }
        var urlChanged = page.url !== nu;
        page.name = newName.trim();
        page.url = nu;
        saveState();
        if (urlChanged) {
            var w = document.querySelector('.iframe-wrapper[data-id="' + id + '"]');
            if (w) w.remove();
        }
        renderAll();
        showToast(page.name + ' updated');
        return true;
    }

    function switchPage(id) {
        if (state.activePageId === id) return;
        state.activePageId = id;
        saveState();
        ensureActiveTabPage();
        renderIframes();
        renderTabs();
        renderPagesList();
    }

    // ---- Tab Pagination ----

    function getMaxTabPage() {
        return Math.max(0, Math.ceil(state.pages.length / getTabsPerPage()) - 1);
    }

    function clampTabPage() {
        var max = getMaxTabPage();
        if (state.tabPage > max) state.tabPage = max;
        if (state.tabPage < 0) state.tabPage = 0;
    }

    function ensureActiveTabPage() {
        if (!state.activePageId) return;
        for (var i = 0; i < state.pages.length; i++) {
            if (state.pages[i].id === state.activePageId) {
                state.tabPage = Math.floor(i / getTabsPerPage());
                return;
            }
        }
    }

    // ---- Rendering ----

    function renderAll() {
        renderEmptyState();
        renderPagesList();
        renderIframes();
        renderTabs();
        if (state.editMode) renderEditGrid();
    }

    function renderEmptyState() {
        if (state.pages.length === 0) els.emptyState.classList.remove('hidden');
        else els.emptyState.classList.add('hidden');
    }

    function renderPagesList() {
        if (state.pages.length === 0) {
            els.pagesList.innerHTML = '<div style="text-align:center;padding:20px 0;color:var(--text-muted);font-size:0.85rem;">No pages added yet</div>';
            return;
        }
        els.pagesList.innerHTML = '';
        state.pages.forEach(function (page) {
            var isActive = page.id === state.activePageId;
            var item = document.createElement('div');
            item.className = 'page-item' + (isActive ? ' active' : '');
            var dot = document.createElement('div');
            dot.className = 'page-item-dot';
            var info = document.createElement('div');
            info.className = 'page-item-info';
            info.innerHTML = '<div class="page-item-name">' + escapeHtml(page.name) + '</div><div class="page-item-url">' + escapeHtml(getDomain(page.url)) + '</div>';
            item.appendChild(dot);
            item.appendChild(info);
            item.addEventListener('click', function () { switchPage(page.id); closeSidebar(); });
            els.pagesList.appendChild(item);
        });
    }

    function renderIframes() {
        var existing = {};
        els.iframeContainer.querySelectorAll('.iframe-wrapper').forEach(function (w) { existing[w.dataset.id] = w; });
        state.pages.forEach(function (page) { if (!existing[page.id]) createIframeWrapper(page); });
        els.iframeContainer.querySelectorAll('.iframe-wrapper').forEach(function (w) {
            if (!state.pages.find(function (p) { return p.id === w.dataset.id; })) w.remove();
        });
        els.iframeContainer.querySelectorAll('.iframe-wrapper').forEach(function (w) {
            if (w.dataset.id === state.activePageId) w.classList.add('active');
            else w.classList.remove('active');
        });
    }

    function createIframeWrapper(page) {
        var wrapper = document.createElement('div');
        wrapper.className = 'iframe-wrapper';
        wrapper.dataset.id = page.id;
        var loading = document.createElement('div');
        loading.className = 'iframe-loading';
        loading.innerHTML = '<div class="spinner"></div><span>Loading ' + escapeHtml(page.name) + '\u2026</span>';
        var iframe = document.createElement('iframe');
        iframe.src = page.url;
        iframe.title = page.name;
        iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen');
        iframe.setAttribute('allowfullscreen', '');
        iframe.setAttribute('loading', 'lazy');
        iframe.addEventListener('load', function () { loading.classList.add('hidden'); });
        iframe.addEventListener('error', function () {
            loading.innerHTML =
                '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>' +
                '<span>Failed to load ' + escapeHtml(page.name) + '</span>';
        });
        wrapper.appendChild(loading);
        wrapper.appendChild(iframe);
        els.iframeContainer.appendChild(wrapper);
    }

    function renderTabs() {
        if (state.pages.length <= 1) { els.tabsBar.classList.remove('visible'); return; }
        els.tabsBar.classList.add('visible');
        var tpp = getTabsPerPage();
        var totalPages = Math.ceil(state.pages.length / tpp);
        clampTabPage();
        var start = state.tabPage * tpp;
        var end = Math.min(start + tpp, state.pages.length);
        var visible = state.pages.slice(start, end);
        if (totalPages > 1) {
            els.tabArrowLeft.classList.add('visible');
            els.tabArrowRight.classList.add('visible');
            els.tabArrowLeft.disabled = state.tabPage === 0;
            els.tabArrowRight.disabled = state.tabPage >= totalPages - 1;
            els.tabArrowLeft.style.opacity = state.tabPage === 0 ? '0.3' : '1';
            els.tabArrowRight.style.opacity = state.tabPage >= totalPages - 1 ? '0.3' : '1';
        } else {
            els.tabArrowLeft.classList.remove('visible');
            els.tabArrowRight.classList.remove('visible');
        }
        els.tabsWindow.innerHTML = '';
        visible.forEach(function (page) {
            var tab = document.createElement('div');
            tab.className = 'tab-item' + (page.id === state.activePageId ? ' active' : '');
            tab.textContent = page.name;
            tab.addEventListener('click', function () { switchPage(page.id); });
            els.tabsWindow.appendChild(tab);
        });
    }

    // ---- Edit Mode ----

    function enterEditMode() {
        state.editMode = true;
        els.editOverlay.classList.add('active');
        closeSidebar();
        renderEditGrid();
    }

    function exitEditMode() {
        state.editMode = false;
        els.editOverlay.classList.remove('active');
        renderAll();
    }

    function renderEditGrid() {
        if (state.pages.length === 0) {
            els.editGrid.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-muted);"><p>No websites to edit.</p></div>';
            return;
        }
        els.editGrid.innerHTML = '';
        state.pages.forEach(function (page, index) {
            var card = document.createElement('div');
            card.className = 'edit-card';
            card.dataset.id = page.id;
            card.dataset.index = index;
            card.setAttribute('draggable', 'true');

            var preview = document.createElement('div');
            preview.className = 'edit-card-preview';
            var letter = document.createElement('div');
            letter.className = 'preview-letter';
            letter.textContent = getInitial(page.name);
            preview.appendChild(letter);

            var body = document.createElement('div');
            body.className = 'edit-card-body';

            var info = document.createElement('div');
            info.className = 'edit-card-info';
            info.innerHTML = '<div class="edit-card-name">' + escapeHtml(page.name) + '</div><div class="edit-card-url">' + escapeHtml(page.url) + '</div>';

            var actions = document.createElement('div');
            actions.className = 'edit-card-actions';

            var dragBtn = document.createElement('button');
            dragBtn.className = 'edit-card-btn drag-btn';
            dragBtn.setAttribute('aria-label', 'Drag to reorder');
            dragBtn.innerHTML =
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">' +
                '<circle cx="9" cy="5" r="1.8"></circle><circle cx="15" cy="5" r="1.8"></circle>' +
                '<circle cx="9" cy="12" r="1.8"></circle><circle cx="15" cy="12" r="1.8"></circle>' +
                '<circle cx="9" cy="19" r="1.8"></circle><circle cx="15" cy="19" r="1.8"></circle></svg>';

            var editBtn = document.createElement('button');
            editBtn.className = 'edit-card-btn edit-btn';
            editBtn.setAttribute('aria-label', 'Edit');
            editBtn.innerHTML =
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>' +
                '<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';

            var deleteBtn = document.createElement('button');
            deleteBtn.className = 'edit-card-btn delete-btn';
            deleteBtn.setAttribute('aria-label', 'Remove');
            deleteBtn.innerHTML =
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
                '<polyline points="3 6 5 6 21 6"></polyline>' +
                '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';

            actions.appendChild(dragBtn);
            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);
            body.appendChild(info);
            body.appendChild(actions);
            card.appendChild(preview);
            card.appendChild(body);

            editBtn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); openEditPageModal(page.id); });
            editBtn.addEventListener('touchend', function (e) { e.preventDefault(); e.stopPropagation(); openEditPageModal(page.id); });

            var delFn = function () {
                removePage(page.id).then(function () {
                    if (state.editMode) {
                        if (state.pages.length === 0) exitEditMode();
                        else renderEditGrid();
                    }
                });
            };
            deleteBtn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); delFn(); });
            deleteBtn.addEventListener('touchend', function (e) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); delFn(); });

            els.editGrid.appendChild(card);
        });

        setupDragAndDrop();
    }

    // ---- Edit Modal ----

    function openEditPageModal(id) {
        var page = state.pages.find(function (p) { return p.id === id; });
        if (!page) return;
        state.editingPageId = id;
        els.editPageName.value = page.name;
        els.editPageUrl.value = page.url;
        els.editPageModal.classList.add('active');
        setTimeout(function () { els.editPageName.focus(); els.editPageName.select(); }, 100);
    }

    function closeEditPageModal() {
        state.editingPageId = null;
        els.editPageModal.classList.remove('active');
    }

    function saveEditPageChanges() {
        if (!state.editingPageId) return;
        if (updatePage(state.editingPageId, els.editPageName.value, els.editPageUrl.value)) {
            closeEditPageModal();
            if (state.editMode) renderEditGrid();
        }
    }

    // ---- Drag & Drop ----

    function setupDragAndDrop() {
        var cards = els.editGrid.querySelectorAll('.edit-card');
        var draggedCard = null;
        var draggedIndex = -1;
        var touchActive = false;
        var touchTarget = null;
        var touchDropPos = null;
        var longTimer = null;
        var ghost = null;
        var scrollInterval = null;

        function clearIndicators() {
            cards.forEach(function (c) {
                c.classList.remove('drag-over', 'marching-above', 'marching-below');
                c.querySelectorAll('.marching-label').forEach(function (l) { l.remove(); });
            });
        }

        function removeGhost() {
            if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
            ghost = null;
        }

        function stopAutoScroll() {
            if (scrollInterval) { clearInterval(scrollInterval); scrollInterval = null; }
        }

        function startAutoScroll(touchY) {
            stopAutoScroll();
            var grid = els.editGrid;
            var rect = grid.getBoundingClientRect();
            var edgeSize = 60;
            scrollInterval = setInterval(function () {
                if (!touchActive) { stopAutoScroll(); return; }
                if (touchY < rect.top + edgeSize) grid.scrollTop -= 8;
                else if (touchY > rect.bottom - edgeSize) grid.scrollTop += 8;
            }, 16);
        }

        cards.forEach(function (card) {
            card.addEventListener('dragstart', function (e) {
                if (e.target.closest('.delete-btn') || e.target.closest('.edit-btn')) { e.preventDefault(); return; }
                draggedCard = card;
                draggedIndex = parseInt(card.dataset.index);
                card.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', card.dataset.id);
            });

            card.addEventListener('dragend', function () {
                card.classList.remove('dragging');
                clearIndicators();
                draggedCard = null;
            });

            card.addEventListener('dragover', function (e) {
                e.preventDefault();
                if (card !== draggedCard) { clearIndicators(); card.classList.add('drag-over'); }
            });

            card.addEventListener('dragleave', function () { card.classList.remove('drag-over'); });

            card.addEventListener('drop', function (e) {
                e.preventDefault();
                card.classList.remove('drag-over');
                if (card === draggedCard || !draggedCard) return;
                reorderPages(draggedIndex, parseInt(card.dataset.index));
            });

            card.addEventListener('touchstart', function (e) {
                if (e.target.closest('.delete-btn') || e.target.closest('.edit-btn')) return;
                if (e.target.closest('.drag-btn')) {
                    e.preventDefault();
                    beginTouchDrag(card, e.touches[0]);
                    return;
                }
                longTimer = setTimeout(function () { beginTouchDrag(card, e.touches[0]); }, 400);
            }, { passive: false });

            card.addEventListener('touchmove', function (e) {
                if (!touchActive) { clearTimeout(longTimer); return; }
                e.preventDefault();
                var touch = e.touches[0];
                if (ghost) {
                    ghost.style.left = (touch.clientX - 40) + 'px';
                    ghost.style.top = (touch.clientY - 20) + 'px';
                }
                startAutoScroll(touch.clientY);
                if (ghost) ghost.style.display = 'none';
                var el = document.elementFromPoint(touch.clientX, touch.clientY);
                if (ghost) ghost.style.display = '';
                clearIndicators();
                if (el) {
                    var tc = el.closest('.edit-card');
                    if (tc && tc !== draggedCard) {
                        var rect = tc.getBoundingClientRect();
                        var midY = rect.top + rect.height / 2;
                        var targetIdx = parseInt(tc.dataset.index);
                        var pageName = state.pages[targetIdx] ? state.pages[targetIdx].name : '';
                        if (touch.clientY < midY) {
                            tc.classList.add('marching-above');
                            touchDropPos = 'above';
                            var lbl = document.createElement('div');
                            lbl.className = 'marching-label above';
                            lbl.textContent = 'Drop above "' + pageName + '"';
                            tc.appendChild(lbl);
                        } else {
                            tc.classList.add('marching-below');
                            touchDropPos = 'below';
                            var lbl2 = document.createElement('div');
                            lbl2.className = 'marching-label below';
                            lbl2.textContent = 'Drop below "' + pageName + '"';
                            tc.appendChild(lbl2);
                        }
                        touchTarget = tc;
                    } else {
                        touchTarget = null;
                        touchDropPos = null;
                    }
                }
            }, { passive: false });

            card.addEventListener('touchend', function (e) {
                clearTimeout(longTimer);
                stopAutoScroll();
                if (!touchActive) return;
                e.preventDefault();
                touchActive = false;
                if (draggedCard) draggedCard.classList.remove('dragging');
                clearIndicators();
                removeGhost();
                if (touchTarget && touchTarget !== draggedCard) {
                    var targetIndex = parseInt(touchTarget.dataset.index);
                    if (touchDropPos === 'below') targetIndex++;
                    if (draggedIndex < targetIndex) targetIndex--;
                    targetIndex = Math.max(0, Math.min(targetIndex, state.pages.length - 1));
                    reorderPages(draggedIndex, targetIndex);
                }
                draggedCard = null;
                touchTarget = null;
                touchDropPos = null;
            });

            card.addEventListener('touchcancel', function () {
                clearTimeout(longTimer);
                stopAutoScroll();
                touchActive = false;
                if (draggedCard) draggedCard.classList.remove('dragging');
                clearIndicators();
                removeGhost();
                draggedCard = null;
                touchTarget = null;
                touchDropPos = null;
            });
        });

        function beginTouchDrag(src, touch) {
            touchActive = true;
            draggedCard = src;
            draggedIndex = parseInt(src.dataset.index);
            src.classList.add('dragging');
            if (navigator.vibrate) navigator.vibrate(30);
            var pageName = state.pages[draggedIndex] ? state.pages[draggedIndex].name : '';
            ghost = document.createElement('div');
            ghost.className = 'drag-ghost';
            ghost.textContent = '\u2195 ' + pageName;
            ghost.style.left = (touch.clientX - 40) + 'px';
            ghost.style.top = (touch.clientY - 20) + 'px';
            document.body.appendChild(ghost);
        }

        function reorderPages(from, to) {
            if (from === to) return;
            var m = state.pages.splice(from, 1)[0];
            state.pages.splice(to, 0, m);
            saveState();
            renderEditGrid();
            renderTabs();
            showToast('Moved to position ' + (to + 1));
        }
    }

    // ---- Init ----

    function init() {
        loadState();
        ensureActiveTabPage();
        renderAll();

        els.sidebarTrigger.addEventListener('click', openSidebar);
        els.sidebarTrigger.addEventListener('touchend', function (e) { e.preventDefault(); openSidebar(); });
        els.closeSidebar.addEventListener('click', closeSidebar);
        els.overlay.addEventListener('click', closeSidebar);

        els.addUrlBtn.addEventListener('click', function () { addPage(els.urlName.value, els.urlInput.value); });
        els.urlInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') addPage(els.urlName.value, els.urlInput.value); });
        els.urlName.addEventListener('keydown', function (e) { if (e.key === 'Enter') els.urlInput.focus(); });

        els.editModeBtn.addEventListener('click', function () {
            if (state.pages.length === 0) { showToast('Add some websites first', 'error'); return; }
            enterEditMode();
        });

        els.doneEditBtn.addEventListener('click', exitEditMode);
        els.closeEditModal.addEventListener('click', closeEditPageModal);
        els.cancelEditPage.addEventListener('click', closeEditPageModal);
        els.saveEditPage.addEventListener('click', saveEditPageChanges);
        els.editPageModal.addEventListener('click', function (e) { if (e.target === els.editPageModal) closeEditPageModal(); });
        els.editPageName.addEventListener('keydown', function (e) { if (e.key === 'Enter') els.editPageUrl.focus(); });
        els.editPageUrl.addEventListener('keydown', function (e) { if (e.key === 'Enter') saveEditPageChanges(); });

        els.tabArrowLeft.addEventListener('click', function () {
            if (state.tabPage > 0) { state.tabPage--; renderTabs(); }
        });
        els.tabArrowRight.addEventListener('click', function () {
            if (state.tabPage < getMaxTabPage()) { state.tabPage++; renderTabs(); }
        });

        var resizeTimer;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () { clampTabPage(); renderTabs(); }, 150);
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                if (els.editPageModal.classList.contains('active')) closeEditPageModal();
                else if (state.editMode) exitEditMode();
                else if (state.sidebarOpen) closeSidebar();
            }
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

})();