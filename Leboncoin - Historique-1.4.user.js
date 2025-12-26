// ==UserScript==
// @name         Leboncoin - Historique 
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Affiche l'historique de manière compacte sur les listes et détaillée sur l'annonce.
// @author       OptiPanda
// @match        https://www.leboncoin.fr/*
// @icon         https://www.leboncoin.fr/favicon.ico
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    var currentPostId = "";
    let lastUrl = location.href;
    const dataCache = new Map();

    start();

    const observer = new MutationObserver((mutations) => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            currentPostId = "";
            start();
        }
        if (mutations.some(m => m.addedNodes.length > 0 || m.type === 'childList')) {
            clearTimeout(window.lbcTimer);
            window.lbcTimer = setTimeout(() => applyOldPrice(), 300);
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    function start() {
        setTimeout(() => applyOldPrice(), 500);
    }

    function applyOldPrice() {
        // Cas 1 : Page Annonce (DÉTAILLÉ)
        var article = document.querySelector("article#grid");
        if (article) {
            const dateDisplay = document.getElementById("old_date_to_display_published");
            if (!dateDisplay || currentPostId !== getPostId()) {
                applyOldPrice4Article(article);
            }
        }

        // Cas 2 : Liste d'annonces (COMPACT)
        var allAdItems = document.querySelectorAll('[data-qa-id="aditem_container"]');
        if (allAdItems.length > 0) {
            applyOldPrice4ListAds(allAdItems);
        }
    }

    async function applyOldPrice4ListAds(allAdItems) {
        allAdItems.forEach(adItem => {
            const existingOldPrice = adItem.querySelector('[id^="old_price_to_display_"]');
            const existingOldDate = adItem.querySelector('[id^="old_date_to_display_"]');
            if (!existingOldPrice || !existingOldDate) {
                applyOldPrice4Ad(adItem);
            }
        });
    }

    async function applyOldPrice4Ad(adItem) {
        const link = adItem.querySelector('[href]');
        if(!link) return;
        const adId = getAdId(link.getAttribute('href'));
        let datas = dataCache.get(adId);

        if (!datas) {
            if (adItem.getAttribute('data-fetching') === 'true') return;
            adItem.setAttribute('data-fetching', 'true');
            datas = await getApiData(adId);
            adItem.removeAttribute('data-fetching');
            if (datas) dataCache.set(adId, datas);
        }
        if(!datas) return;

        // PRIX COMPACT (Pas de %, juste le prix barré)
        if (!adItem.querySelector('[id^="old_price_to_display_"]')) {
            const oldPrice = datas?.attributes?.find(o => o.key === 'old_price')?.value;
            const currentPrice = datas?.price ? datas.price[0] : null;
            if (oldPrice && currentPrice) {
                displayPrice(adItem, adId, oldPrice, currentPrice, true);
            }
        }

        // DATE COMPACTE (JJ/MM/AA uniquement)
        if (!adItem.querySelector('[id^="old_date_to_display_"]')) {
            const oldDate = datas?.first_publication_date;
            if (oldDate) displayDateInAds(adItem, adId, oldDate);
        }
    }

    async function applyOldPrice4Article(article) {
        const postId = getPostId();
        currentPostId = postId;
        let datas = dataCache.get(postId);
        if (!datas) {
            datas = await getApiData(postId);
            if (datas) dataCache.set(postId, datas);
        }
        if(!datas) return;

        // PRIX DÉTAILLÉ
        if (!document.querySelector('[id^="old_price_to_display_"]')) {
            const currentPrice = datas?.price ? datas.price[0] : null;
            const oldPrice = datas?.attributes?.find(o => o.key === 'old_price')?.value;
            if (oldPrice && currentPrice) displayPrice(article, postId, oldPrice, currentPrice, false);
        }

        // DATE DÉTAILLÉE
        if (!document.getElementById("old_date_to_display_published")) {
            displayOldDateInElement(article, postId, datas.first_publication_date, datas.index_date);
        }
    }

    // --- FONCTIONS DE FORMATTAGE ---

    function displayPrice(element, id, oldPrice, currentPrice, isCompact) {
        const priceContainers = element.querySelectorAll('[data-qa-id="adview_price"], [data-test-id="price"]');
        if(priceContainers.length === 0) return;
        const priceContainer = priceContainers[0];
        priceContainer.style.display = 'none';

        if (isCompact) {
            // Version Liste : juste le prix barré simple
            priceContainer.insertAdjacentHTML('beforebegin', `
                <div id="old_price_to_display_${id}" class="flex items-center">
                    <p class="text-headline-2 mr-sm">${spaceDigits(currentPrice)}&nbsp;€</p>
                    <p class="text-caption line-through text-neutral" style="text-decoration: line-through; opacity: 0.7;">${spaceDigits(oldPrice)}&nbsp;€</p>
                </div>`);
        } else {
            // Version Annonce : Calculs complets + Tag
            const reduction = (+currentPrice - +oldPrice);
            const percent = Math.round((reduction / oldPrice) * 1000) / 10;
            priceContainer.insertAdjacentHTML('beforebegin', `
                <div id="old_price_to_display_${id}" class="flex flex-wrap items-center">
                    <div class="mr-md flex items-center text-success"><p class="text-headline-2">${spaceDigits(currentPrice)}&nbsp;€</p></div>
                    <div class="text-error line-through mr-sm" style="text-decoration: line-through;">${spaceDigits(oldPrice)}&nbsp;€</div>
                    <span class="box-border inline-flex items-center text-caption font-bold px-md rounded-full border-sm border-current text-support">
                        ${spaceDigits(reduction)} € (${percent}%)
                    </span>
                </div>`);
        }
    }

    function displayDateInAds(ad, adId, oldDate) {
        const dateContainer = ad.querySelector('[data-test-id="image"]~div[class^="adcard_"]>div.flex');
        if (dateContainer && dateContainer.firstChild) {
            const d = new Date(oldDate);
            const shortDate = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear().toString().slice(-2)}`;
            const p = document.createElement("p");
            p.id = "old_date_to_display_" + adId;
            p.className = "text-caption text-neutral mt-xs";
            p.innerHTML = "Le " + shortDate;
            dateContainer.firstChild.after(p);
        }
    }

    function displayOldDateInElement(element, id, oldDate, currentDate) {
        element.querySelectorAll('[id^="old_date_to_display_"]').forEach(el => el.remove());
        const descContainer = document.querySelector('[data-qa-id="adview_spotlight_description_container"]');
        if(!descContainer) return;
        let tagsContainer = descContainer.querySelector('.gap-md.flex.flex-wrap') || document.createElement("div");
        if (!tagsContainer.parentElement) {
            tagsContainer.className = "gap-md flex flex-wrap items-center mt-md";
            descContainer.appendChild(tagsContainer);
        }
        tagsContainer.prepend(createDateTag("Modifié le ", new Date(currentDate), "old_date_to_display_modified"));
        if (oldDate) tagsContainer.prepend(createDateTag("Publié le ", new Date(oldDate), "old_date_to_display_published"));
    }

    // --- HELPERS ---
    function createDateTag(preText, date, id) {
        const gap = Math.floor((new Date().getTime() - date.getTime()) / 86400000);
        const tag = document.createElement("span");
        tag.id = id;
        tag.className = "box-border inline-flex items-center text-caption font-bold px-md h-sz-20 rounded-full text-on-support-container mr-md";
        tag.style.backgroundColor = gap > 30 ? '#ffcccc' : '#e0e0e0';
        tag.innerHTML = preText + date.toLocaleDateString("fr-FR") + (gap > 0 ? ` (${gap}j)` : " (Auj.)");
        return tag;
    }

    function getApiData(postId) {
        return fetch(`https://api.leboncoin.fr/finder/classified/${postId}`).then(res => res.json()).catch(() => null);
    }
    function getPostId() { return window.location.href.split("/").pop().split('.')[0]; }
    function getAdId(url) { return url.split("/").pop().split('.')[0]; }
    function spaceDigits(d) { return (d + "").replaceAll(/\B(?=(\d{3})+(?!\d))/g, " "); }

})();