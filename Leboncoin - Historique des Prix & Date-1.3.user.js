// ==UserScript==
// @name         Leboncoin - Historique des Prix & Date
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Affiche la date de mise en ligne originale et les baisses de prix. Version renforcée pour compatibilité avec d'autres scripts.
// @author       OptiPanda (Portage Userscript)
// @match        https://www.leboncoin.fr/*
// @icon         https://www.leboncoin.fr/favicon.ico
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // --- CONFIGURATION & VARIABLES GLOBALES ---
    var currentPostId = "";
    let lastUrl = location.href;
    // Cache pour éviter de rappeler l'API pour une annonce qu'on connaît déjà
    const dataCache = new Map();

    // --- SYSTEME DE DETECTION ---
    start();

    const observer = new MutationObserver((mutations) => {
        // 1. Détection changement d'URL (Navigation)
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            currentPostId = "";
            start();
        }

        // 2. Détection changement dans la page (Conflit scripts ou Scroll)
        // On vérifie si notre affichage a disparu des éléments visibles
        let needsUpdate = false;

        // On regarde si des nœuds ont été ajoutés OU si nos éléments ont disparu
        // Si un autre script réécrit le DOM, il va trigger une mutation
        if (mutations.some(m => m.addedNodes.length > 0 || m.type === 'childList')) {
            needsUpdate = true;
        }

        if (needsUpdate) {
            // Debounce plus court pour être plus réactif face à l'autre script
            clearTimeout(window.lbcTimer);
            window.lbcTimer = setTimeout(() => applyOldPrice(), 300);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });


    // --- FONCTIONS PRINCIPALES ---
    function start() {
        setTimeout(() => applyOldPrice(), 500);
    }

    function applyOldPrice() {
        // Cas 1 : Page Annonce
        var article = document.querySelector("article#grid");
        if (article) {
            // Sur la page article, on vérifie si NOS éléments sont là.
            // S'ils ne sont pas là (effacés par l'autre script), on relance.
            const dateDisplay = document.getElementById("old_date_to_display_published") || document.getElementById("old_date_to_display_modified");
            if (!dateDisplay || currentPostId !== getPostId()) {
                applyOldPrice4Article(article);
            }
        }

        // Cas 2 : Liste d'annonces
        var allAdItems = document.querySelectorAll('[data-qa-id="aditem_container"]');
        if (allAdItems.length > 0) {
            applyOldPrice4ListAds(allAdItems);
        }
    }

    // --- LOGIQUE LISTE D'ANNONCES (La partie critique pour ton conflit) ---
    async function applyOldPrice4ListAds(allAdItems) {
        allAdItems.forEach(adItem => {
            // MODIFICATION MAJEURE ICI :
            // On ne vérifie plus un attribut sur le parent, mais la présence réelle de NOTRE div prix.
            // Si l'autre script a réécrit l'annonce, notre div a disparu, donc on la remet.
            const existingOldPrice = adItem.querySelector('[id^="old_price_to_display_"]');
            const existingOldDate = adItem.querySelector('[id^="old_date_to_display_"]');

            // Si l'un des deux manque, on relance le traitement pour cet item
            if (!existingOldPrice || !existingOldDate) {
                applyOldPrice4Ad(adItem);
            }
        });
    }

    async function applyOldPrice4Ad(adItem) {
        const link = adItem.querySelector('[href]');
        if(!link) return;

        const adId = getAdId(link.getAttribute('href'));

        // On utilise le cache pour répondre instantanément si l'autre script efface le DOM
        let datas = dataCache.get(adId);

        if (!datas) {
            // Si pas en cache, on fetch (avec marqueur pour éviter double appel réseau)
            if (adItem.getAttribute('data-fetching') === 'true') return;
            adItem.setAttribute('data-fetching', 'true');
            datas = await getApiData(adId);
            adItem.removeAttribute('data-fetching');
            if (datas) dataCache.set(adId, datas);
        }

        if(!datas) return;

        // Réinjection du PRIX
        // On revérifie l'existence juste avant d'injecter pour éviter les doublons millimétrés
        if (!adItem.querySelector('[id^="old_price_to_display_"]')) {
            const oldPrice = datas?.attributes?.filter(o => o.key === 'old_price')[0]?.value;
            if (oldPrice) {
                const currentPrice = datas?.price ? datas.price[0] : null;
                if(currentPrice) displayOldPriceInElement(adItem, adId, oldPrice, currentPrice);
            }
        }

        // Réinjection de la DATE
        if (!adItem.querySelector('[id^="old_date_to_display_"]')) {
            const oldDate = datas?.first_publication_date;
            if (oldDate) {
                const currentDate = datas?.index_date;
                displayOldDateInAds(adItem, adId, oldDate, currentDate);
            }
        }

        enhanceAdMileage(adItem);
    }

    // --- LOGIQUE ARTICLE (Similaire) ---
    async function applyOldPrice4Article(article) {
        const postId = getPostId();
        currentPostId = postId;

        let datas = dataCache.get(postId);
        if (!datas) {
            datas = await getApiData(postId);
            if (datas) dataCache.set(postId, datas);
        }
        if(!datas) return;

        const oldDate = datas?.first_publication_date;

        try {
            const currentDate = datas?.index_date;
            // Vérif existence avant injection
            if (!document.getElementById("old_date_to_display_published")) {
                if (oldDate) displayOldDateInElement(article, postId, oldDate, currentDate);
                else displayOldDateInElement(article, postId, currentDate, currentDate);
            }
        } catch (e) { err(e); }

        try {
            // Vérif existence avant injection prix
            if (!document.querySelector('[id^="old_price_to_display_"]')) {
                const currentPrice = datas?.price ? datas.price[0] : null;
                const oldPrice = datas?.attributes?.filter(o => o.key === 'old_price')[0]?.value;

                if (oldPrice && currentPrice) {
                    displayOldPriceInElement(article, postId, oldPrice, currentPrice);
                } else if (currentPrice) {
                    displayCurrentPriceInElement(article, postId, currentPrice);
                }
            }
        } catch (e) { err(e); }

        // Fonctions cosmétiques (moins graves si écrasées, mais on tente de les remettre)
        try { enhanceArticleDescriptionDisplay(article); } catch (e) { }
        try { enhanceArticleCritereDisplay(article, datas); } catch (e) { }
        try { enhanceAdviewSticky(); } catch (e) { }
        try { moveLesPLus(article); } catch (e) { }
        try { movePackSerenite(article); } catch (e) { }
        try { moveAutoviza(article); } catch (e) { }
        try { moveProtection(article); } catch (e) { }
        try { moveProtectionVoyageur(article); } catch (e) { }
    }


    // --- FONCTIONS D'AFFICHAGE & UTILITAIRES (Inchangées ou adaptées) ---

    function getApiData(postId) {
        return fetch(new Request(`https://api.leboncoin.fr/finder/classified/${postId}`))
            .then((response) => response.json())
            .catch(e => { console.error(e); return null; });
    }

    function displayOldPriceInElement(element, id, oldPrice, currentPrice) {
        // Nettoyage préventif
        const exist = element.querySelector('[id^="old_price_to_display_"]');
        if (exist) exist.remove();

        const priceContainers = element.querySelectorAll('[data-qa-id="adview_price"], [data-test-id="price"]');
        if(priceContainers.length === 0) return;
        const priceContainer = priceContainers[0];

        const reduction = (+currentPrice - +oldPrice);
        const percentReduce = reduction / oldPrice;
        const percentReduceDisplay = Math.round(percentReduce * 1000) / 10;

        // On cache l'original via CSS direct pour éviter que l'autre script ne le réaffiche
        priceContainer.style.display = 'none';

        const html = `
        <div id="old_price_to_display_${id}" class="flex flex-wrap items-center mr-md">
            <div class="mr-md flex flex-wrap items-center justify-between">
                <div class="flex">
                    <p class="text-headline-2 text-success">${spaceDigits(currentPrice)}&nbsp;€</p>&nbsp;
                    <svg viewBox="0 0 24 24" fill="currentColor" class="text-success w-sz-24 h-sz-24"><path d="m2.29,6.3c.39-.4,1.02-.4,1.41,0l4.83,4.96,2.97-3.05c.32-.32.74-.5,1.18-.5s.87.18,1.18.5h0s6.12,6.28,6.12,6.28v-3.21c0-.57.45-1.03,1-1.03s1,.46,1,1.03v5.68c0,.57-.45,1.03-1,1.03h-5.54c-.55,0-1-.46-1-1.03s.45-1.03,1-1.03h3.12l-5.89-6.05-2.97,3.05c-.32.32-.74.5-1.18.5s-.87-.18-1.18-.5h0S2.29,7.75,2.29,7.75c-.39-.4-.39-1.05,0-1.45Z"></path></svg>
                </div>
            </div>
            <div class="text-error line-through" style="text-decoration: line-through; color: red; margin-right: 5px;">${spaceDigits(oldPrice)}&nbsp;€</div>
            <span data-spark-component="tag" class="box-border inline-flex items-center justify-center gap-sm whitespace-nowrap text-caption font-bold h-sz-20 px-md rounded-full border-sm border-current text-support ml-sm">
                ${spaceDigits(reduction)} € (${percentReduceDisplay}%)
            </span>
        </div>`;

        priceContainer.insertAdjacentHTML('beforebegin', html);
    }

    function displayCurrentPriceInElement(element, id, currentPrice) {
        const exist = element.querySelector('[id^="old_price_to_display_"]');
        if (exist) exist.remove();
        const priceContainer = element.querySelectorAll('[data-qa-id="adview_price"], [data-test-id="price"]')[0];
        if(!priceContainer) return;

        priceContainer.style.display = 'none';
        priceContainer.insertAdjacentHTML('beforebegin', `
        <div id="old_price_to_display_${id}" class="flex flex-wrap items-center mr-md">
            <div class="flex"><p class="text-headline-2">${spaceDigits(currentPrice)}&nbsp;€</p></div>
        </div>`);
    }

    function displayOldDateInAds(ad, adId, oldDate, currentDate) {
        // Si l'élément existe déjà, on ne fait rien (pour éviter le clignotement)
        if (ad.querySelector("[id^='old_date_to_display_']")) return;

        var dateContainer = ad.querySelector('[data-test-id="image"]~div[class^="adcard_"]>div.flex');
        if (dateContainer && dateContainer.firstChild) {
            const divOldDate = createDivOldDate(adId, "flex flex-wrap overflow-hidden mt-sm text-caption text-neutral", oldDate, currentDate);
            dateContainer.firstChild.after(divOldDate);
        }
    }

    function createDivOldDate(id, currentDateClass, oldDate, currentDate) {
        const divOldDate = document.createElement("div");
        divOldDate.id = "old_date_to_display_" + id;
        divOldDate.className = "flex flex-wrap items-center";

        const pOldDate = document.createElement("p");
        pOldDate.className = currentDateClass;
        pOldDate.innerHTML = "Mise en ligne le " + dateFormatter(new Date(oldDate));
        divOldDate.appendChild(pOldDate);

        if (oldDate !== currentDate) {
            const pCurrentDate = document.createElement("p");
            pCurrentDate.className = currentDateClass;
            pCurrentDate.innerHTML = "Mise à jour le " + dateFormatter(new Date(currentDate));
            divOldDate.appendChild(pCurrentDate);
            divOldDate.classList.add("flex-col");
        }
        return divOldDate;
    }

    function displayOldDateInElement(element, id, oldDate, currentDate) {
         // Nettoyage des anciens tags pour éviter duplication
        element.querySelectorAll('[id^="old_date_to_display_"]').forEach(el => el.remove());

        const descContainer = document.querySelector('[data-qa-id="adview_spotlight_description_container"]');
        if(!descContainer) return;

        let tagsContainer = descContainer.querySelector('.gap-md.flex.flex-wrap'); // Tentative de récupérer le container existant
        if (!tagsContainer) {
            // Création si inexistant (ou supprimé par l'autre script)
            tagsContainer = document.createElement("div");
            tagsContainer.className = "gap-md flex flex-wrap items-center empty:hidden";
            descContainer.appendChild(tagsContainer);
        }

        const spanDatePubliTag = createDateTag("Modifié le ", new Date(currentDate));
        if (spanDatePubliTag) {
            spanDatePubliTag.id = "old_date_to_display_modified";
            tagsContainer.prepend(spanDatePubliTag);
        }

        if (oldDate) {
            const spanDateModifTag = createDateTag("Publié le ", new Date(oldDate));
            if (spanDateModifTag) {
                spanDateModifTag.id = "old_date_to_display_published";
                tagsContainer.prepend(spanDateModifTag);
            }
        }
    }

    function createDateTag(preText, date) {
        const gap = getGapWithToday(date);
        const tag = document.createElement("span");
        tag.className = "box-border default:inline-flex default:w-fit items-center justify-center gap-sm whitespace-nowrap text-caption font-bold px-md h-sz-20 rounded-full text-on-support-container mr-md";
        tag.setAttribute("data-spark-component", "tag");
        tag.style.backgroundColor = gap.inDays > 30 ? '#ffcccc' : '#e0e0e0';
        tag.style.color = 'black';
        tag.style.padding = '2px 8px';
        tag.style.borderRadius = '12px';
        tag.style.marginRight = '5px';
        tag.style.fontSize = '12px';
        tag.innerHTML = preText + date.toLocaleDateString("fr-FR", {day: "2-digit", month:"2-digit", year:"numeric"}) + gap.asString;
        return tag;
    }

    // --- AUTRES HELPERS ---
    function enhanceAdMileage(adItem) {
        const pMileage = document.evaluate(".//p[text()='Kilométrage']", adItem, null, XPathResult.ANY_TYPE, null).iterateNext()?.nextSibling;
        if (pMileage && !pMileage.innerHTML.includes(' ')) { // check espace insécable
            pMileage.innerHTML = spaceDigits(pMileage.innerHTML);
        }
    }

    function enhanceArticleDescriptionDisplay(article) {
        const description = article.querySelector("[data-qa-id='adview_spotlight_description_container'] p");
        if (description?.innerHTML.indexOf("•") !== -1 && description?.innerHTML.indexOf("goToMap") === -1) {
            const splitChar = " • ";
            const oldDesc = description.innerHTML.split(splitChar);
            if(oldDesc.length >= 3) {
                 description.innerHTML = `<a id="goToMap" class="underline inline-flex" style="cursor:pointer">${getPinSvgElement() + oldDesc[0]}</a>`
                + splitChar + oldDesc[1] + splitChar + spaceDigits(oldDesc[2])
                + (oldDesc[3] ? splitChar + oldDesc[3] : "") + (oldDesc[4] ? splitChar + oldDesc[4] : "") + (oldDesc[5] ? splitChar + oldDesc[5] : "");

                const mapLink = document.getElementById("goToMap");
                if(mapLink) mapLink.onclick = () => { window.scrollTo({behavior: 'smooth', top: document.querySelector(".LazyLoad")?.getBoundingClientRect().top + window.scrollY - 56}); };
            }
        }
    }

    function enhanceArticleCritereDisplay(article, datas) {
        const dateMes = Date.parse(datas?.first_publication_date);
        const critere = article.querySelector("[data-qa-id='criteria_item_issuance_date']");
        if (critere && dateMes && !critere.innerHTML.includes('an')) {
             const age = monthDiff(new Date(dateMes), new Date())/12;
             critere.innerHTML = critere.innerHTML.replace(dateMes, `${dateMes} (${Math.round(age * 10) / 10} an${age > 1 ? 's' : ''})`);
        }
    }

    // Deplacements
    function moveAutoviza(a){ moveDivAside(a, document.evaluate("//h2[contains(., 'Autoviza')]", a, null, XPathResult.ANY_TYPE, null).iterateNext()?.parentElement, "autoviza"); }
    function moveProtection(a){ moveDivAside(a, document.evaluate("//section[contains(., 'Protection leboncoin')]", a, null, XPathResult.ANY_TYPE, null).iterateNext(), "protection"); }
    function moveProtectionVoyageur(a){ moveDivAside(a, document.evaluate("//h2[contains(., 'Protection Voyageur')]", a, null, XPathResult.ANY_TYPE, null).iterateNext()?.parentElement?.parentElement, "protectionVoyageur"); }
    function movePackSerenite(a){ moveDivAside(a, document.evaluate("//p[contains(., 'Pack Sérénité*')]", a, null, XPathResult.ANY_TYPE, null).iterateNext()?.parentElement?.parentElement, "packseren"); }
    function moveLesPLus(a){ moveDivAside(a, document.evaluate("//h2[contains(., 'Les + de cette annonce')]", a, null, XPathResult.ANY_TYPE, null).iterateNext()?.parentElement, "lesplus"); }

    function moveDivAside(container, div, type) {
        if (div && !document.querySelector(`[lbc_old_price_move='${type}']`)) {
            div.classList.remove("py-xl","border-b-sm","border-outline");
            const aside = container.querySelector("aside section");
            if(aside){
                const newDiv = document.createElement("div");
                newDiv.setAttribute(`lbc_old_price_move`,type);
                newDiv.appendChild(div);
                aside.after(newDiv);
            }
        }
    }

    function enhanceAdviewSticky() {
        const s = document.querySelector("[data-test-id='adview_container']");
        if (s && !s.classList.contains("cursor-pointer")) { s.classList.add("cursor-pointer"); s.style.width = "-webkit-fill-available"; }
    }

    function getPostId() { return getAdId(window.location.href); }
    function getAdId(url) { return url.split("/").pop().split('.')[0]; }
    function spaceDigits(d) { return (d + "").replaceAll(/\B(?=(\d{3})+(?!\d))/g, " "); }
    function err(a) { console.error("[LBC Old Price] ", a); }
    function monthDiff(d1, d2) { return Math.max(0, (d2.getFullYear() - d1.getFullYear()) * 12 - d1.getMonth() + d2.getMonth()); }
    function getGapWithToday(date) {
        const gapInDays = Math.floor((new Date().getTime() - date.getTime()) / (86400000));
        let gapString = gapInDays > 1 ? ` (${gapInDays} jours)` : (gapInDays == 1 ? ` (Hier)` : (date.getDate() === new Date().getDate() ? ` (Aujourd'hui)` : ` (Hier)`));
        return {inDays: gapInDays, asString: gapString};
    }
    function dateFormatter(d) { return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()} à ${d.getHours()}h${d.getMinutes().toString().padStart(2,'0')}` + getGapWithToday(d).asString; }
    function getPinSvgElement() { return `<svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px;display:inline-block;vertical-align:text-bottom;"><path d="M12 2C7.58 2 4 5.47 4 9.75c0 1.14.41 2.46.97 3.73.55 1.29 1.32 2.63 2.15 3.84.8 1.21 1.66 2.31 2.43 3.12.38.4.76.76 1.12 1.02.18.13.37.25.56.35.19.09.46.19.77.19.31 0 .58-.1.77-.19.19-.1.38-.22.56-.35.35-.26.73-.62 1.12-1.02.76-.81 1.62-1.91 2.43-3.12.83-1.21 1.6-2.55 2.15-3.84.56-1.27.97-2.59.97-3.73C20 5.47 16.42 2 12 2zm0 7.75c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"></path></svg>`; }

})();