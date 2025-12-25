// ==UserScript==
// @name         Leboncoin - Historique des Prix & Date
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Affiche la date de mise en ligne originale, les baisses de prix et réorganise les infos sur Leboncoin. (Basé sur l'extension lbc_old_price)
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

    // --- SYSTEME DE DETECTION (Remplacement de background.js) ---
    // Lance le script au démarrage
    start();

    // Observe les changements de page (Navigation SPA) et le scroll infini
    const observer = new MutationObserver((mutations) => {
        // Détection changement d'URL
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            currentPostId = ""; // Reset pour forcer le re-check sur une nouvelle annonce
            start();
        }

        // Détection de nouvelles annonces (Scroll infini)
        // On vérifie si des éléments pertinents ont été ajoutés
        let shouldRefresh = false;
        for (const mutation of mutations) {
            if (mutation.addedNodes.length) {
                shouldRefresh = true;
                break;
            }
        }
        if (shouldRefresh) {
            // Debounce léger pour éviter de spammer pendant le chargement
            clearTimeout(window.lbcTimer);
            window.lbcTimer = setTimeout(() => start(), 1000);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });


    // --- FONCTIONS PRINCIPALES (Main.js) ---
    function start() {
        // On attend un peu que le DOM soit stable (similaire au setTimeout original)
        // Note: applyOldPrice gère lui-même la distinction Article vs Liste
        applyOldPrice();
    }

    function applyOldPrice() {
        // Cas 1 : Page d'une annonce unique
        var article = document.querySelector("article#grid"); // Selecteur spécifique page annonce
        if (article) {
             // On vérifie si on a déjà traité cette page pour éviter de spammer l'API
            if (currentPostId !== getPostId()) {
                applyOldPrice4Article(article);
            }
        }

        // Cas 2 : Liste d'annonces (Recherche)
        var allAdItems = document.querySelectorAll('[data-qa-id="aditem_container"]');
        if (allAdItems.length > 0) {
            applyOldPrice4ListAds(allAdItems);
        }
    }

    // --- LOGIQUE ARTICLES (Article.js) ---
    async function applyOldPrice4Article(article) {
        const postId = getPostId();
        // Si l'ID a changé en cours de route, on reload (logique originale conservée mais adoucie)
        if (!!currentPostId && currentPostId != postId) {
            // location.reload(); // Evitons le reload brutal en userscript
        }
        currentPostId = postId;

        const datas = await getApiData(postId);
        if(!datas) return; // Sécurité si API échoue

        const oldDate = datas?.first_publication_date;

        try {
            const currentDate = datas?.index_date;
            if (oldDate) {
                displayOldDateInElement(article, postId, oldDate, currentDate);
            } else {
                displayOldDateInElement(article, postId, currentDate, currentDate);
            }
        } catch (e) { err(e); }

        try {
            const currentPrice = datas?.price ? datas.price[0] : null;
            const oldPrice = datas?.attributes?.filter(o => o.key === 'old_price')[0]?.value;

            if (oldPrice && currentPrice) {
                displayOldPriceInElement(article, postId, oldPrice, currentPrice);
            } else if (currentPrice) {
                displayCurrentPriceInElement(article, postId, currentPrice);
            }
        } catch (e) { err(e); }

        // Améliorations visuelles diverses
        try { enhanceArticleDescriptionDisplay(article); } catch (e) { err(e); }
        try { enhanceArticleCritereDisplay(article, datas); } catch (e) { err(e); }
        try { enhanceAdviewSticky(); } catch (e) { err(e); }

        // Déplacement des blocs (Pubs/Services)
        try { moveLesPLus(article); } catch (e) { err(e); }
        try { movePackSerenite(article); } catch (e) { err(e); }
        try { moveAutoviza(article); } catch (e) { err(e); }
        try { moveProtection(article); } catch (e) { err(e); }
        try { moveProtectionVoyageur(article); } catch (e) { err(e); }
    }

    function displayOldDateInElement(element, id, oldDate, currentDate) {
        const exist = element.querySelectorAll('[id^="old_date_to_display_"]');
        if (exist) {
            for (let el of exist) {
                el.parentElement.removeChild(el);
            }
        }
        const descContainer = document.querySelector('[data-qa-id="adview_spotlight_description_container"]');
        if(!descContainer) return;

        var tagsContainer;
        const descriptionTags = Array.from(descContainer.querySelectorAll('[data-spark-component="tag"]'));
        if (descriptionTags && descriptionTags.length > 0) {
            tagsContainer = descriptionTags[0].parentElement;
        } else {
            tagsContainer = document.createElement("div");
            tagsContainer.setAttribute("class", "gap-md flex flex-wrap items-center empty:hidden");
            descContainer.appendChild(tagsContainer);
        }

        if (!tagsContainer) {
            err('Cannot find date Container');
            return;
        }

        const spanDatePubliTag = createDateTag("Modifié le ", new Date(currentDate));

        if (spanDatePubliTag) {
            spanDatePubliTag.setAttribute("id", "old_date_to_display_modified");
            tagsContainer.prepend(spanDatePubliTag);
        }

        if (oldDate) {
            const spanDateModifTag = createDateTag("Publié le ", new Date(oldDate));
            if (spanDateModifTag) {
                spanDateModifTag.setAttribute("id", "old_date_to_display_published");
                tagsContainer.prepend(spanDateModifTag);
            }
        }
    }

    function enhanceArticleDescriptionDisplay(article) {
        const description = article.querySelector("[data-qa-id='adview_spotlight_description_container'] p");

        if (description?.innerHTML.indexOf("•") !== -1 && description?.innerHTML.indexOf("goToMap") === -1) {
            const splitChar = " • ";
            const oldDesc = description.innerHTML.split(splitChar);
            if(oldDesc.length < 3) return; // Safety check

            var place = `<a id="goToMap" class="underline inline-flex" title="Aller à la carte" style="cursor:pointer">${getPinSvgElement() + oldDesc[0]}</a>`;

            description.innerHTML =
                place
                + splitChar + oldDesc[1]
                + splitChar + spaceDigits(oldDesc[2])
                + (oldDesc[3] ? splitChar + oldDesc[3] : "")
                + (oldDesc[4] ? splitChar + oldDesc[4] : "")
                + (oldDesc[5] ? splitChar + oldDesc[5] : "");

            const mapLink = document.getElementById("goToMap");
            if(mapLink) {
                mapLink.onclick = () => {
                    const lazyLoad = document.getElementsByClassName("LazyLoad")[0];
                    if(lazyLoad){
                         window.scrollTo({
                            behavior: 'smooth',
                            top: lazyLoad.getBoundingClientRect().top + window.scrollY - 56,
                        });
                    }
                };
            }
        }
    }

    function enhanceArticleCritereDisplay(article, datas) {
        const dateMes = Date.parse(datas?.first_publication_date);
        var mDiff = 0;
        if (dateMes) {
            mDiff = monthDiff(new Date(dateMes), new Date());
        }

        const critereDatePmes = article.querySelector("[data-qa-id='criteria_item_issuance_date']");

        if (critereDatePmes && dateMes) {
            const age = mDiff/12;
            // On vérifie si on a déjà fait la modif pour éviter la duplication
            if(!critereDatePmes.innerHTML.includes('an')) {
                 critereDatePmes.innerHTML = critereDatePmes.innerHTML.replaceAll(dateMes, `${dateMes} (${Math.round(age * 10) / 10} an${age > 1 ? 's' : ''})`);
            }
        }
    }

    // --- LOGIQUE LISTE D'ANNONCES (Ads.js) ---
    async function applyOldPrice4ListAds(allAdItems) {
        allAdItems.forEach(adItem => {
            // Optimisation : on ajoute un marqueur pour ne pas re-fetcher les annonces déjà traitées
            if (!adItem.hasAttribute('data-lbc-processed')) {
                 applyOldPrice4Ad(adItem);
            }
        });
    }

    async function applyOldPrice4Ad(adItem) {
        const link = adItem.querySelector('[href]');
        if(!link) return;

        const adId = getAdId(link.getAttribute('href'));
        // Marquer comme traité immédiatement pour éviter les appels multiples asynchrones
        adItem.setAttribute('data-lbc-processed', 'true');

        const datas = await getApiData(adId);
        if(!datas) return;

        const oldPrice = datas?.attributes?.filter(o => o.key === 'old_price')[0]?.value;

        if (oldPrice) {
            const currentPrice = datas?.price ? datas.price[0] : null;
            if(currentPrice) displayOldPriceInElement(adItem, adId, oldPrice, currentPrice);
        }

        const oldDate = datas?.first_publication_date;
        if (oldDate) {
            const currentDate = datas?.index_date;
            displayOldDateInAds(adItem, adId, oldDate, currentDate);
        }

        enhanceAdMileage(adItem);
    }

    function displayOldDateInAds(ad, adId, oldDate, currentDate) {
        const exist = ad.querySelector("[id^='old_date_to_display_']");
        if (exist) {
            exist.parentElement.removeChild(exist);
        }

        // Sélecteur ajusté pour la liste
        var dateContainer = ad.querySelector('[data-test-id="image"]~div[class^="adcard_"]>div.flex');
        if (dateContainer && dateContainer.firstChild) {
            const targetClass = "flex flex-wrap overflow-hidden mt-sm text-caption text-neutral";
            const divOldDate = createDivOldDate(adId, targetClass, oldDate, currentDate);
            dateContainer.firstChild.after(divOldDate);
        }
    }

    // --- UTILITAIRES & DEPLACEMENT DOM (Common.js & Article.js helpers) ---

    function getApiData(postId) {
        // Utilisation de fetch standard (l'API leboncoin semble accepter les requêtes du même domaine racine)
        return fetch(new Request(`https://api.leboncoin.fr/finder/classified/${postId}`))
            .then((response) => response.json())
            .catch(e => {
                err("Erreur API " + postId + ": " + e);
                return null;
            });
    }

    function displayOldPriceInElement(element, id, oldPrice, currentPrice) {
        const exist = element.querySelector('[id^="old_price_to_display_"]');
        if (exist) {
            exist.parentElement.removeChild(exist);
        }

        const priceContainers = element.querySelectorAll('[data-qa-id="adview_price"], [data-test-id="price"]');
        if(priceContainers.length === 0) return;
        const priceContainer = priceContainers[0];

        const reduction = (+currentPrice - +oldPrice);
        const percentReduce = reduction / oldPrice;
        const percentReduceDisplay = Math.round(percentReduce * 1000) / 10;

        priceContainer.setAttribute('style', 'display:none !important');

        priceContainer.insertAdjacentHTML('beforebegin', `
        <div id="old_price_to_display_${id}" class="flex flex-wrap items-center mr-md">
            <div class="mr-md flex flex-wrap items-center justify-between">
                <div class="flex">
                    <p class="text-headline-2 text-success">${spaceDigits(currentPrice)}&nbsp;€</p>&nbsp;
                    <svg viewBox="0 0 24 24" data-title="Baisse de prix" fill="currentColor" stroke="none" class="text-success fill-current shrink-0 w-sz-24 h-sz-24" aria-hidden="true">
                        <path fill-rule="evenodd" d="m2.29,6.3c.39-.4,1.02-.4,1.41,0l4.83,4.96,2.97-3.05c.32-.32.74-.5,1.18-.5s.87.18,1.18.5h0s6.12,6.28,6.12,6.28v-3.21c0-.57.45-1.03,1-1.03s1,.46,1,1.03v5.68c0,.57-.45,1.03-1,1.03h-5.54c-.55,0-1-.46-1-1.03s.45-1.03,1-1.03h3.12l-5.89-6.05-2.97,3.05c-.32.32-.74.5-1.18.5s-.87-.18-1.18-.5h0S2.29,7.75,2.29,7.75c-.39-.4-.39-1.05,0-1.45Z"></path>
                    </svg>
                </div>
            </div>
            <div class="text-error line-through" role="deletion" style="text-decoration: line-through; color: red; margin-right: 5px;">${spaceDigits(oldPrice)}&nbsp;€</div>
            <span data-spark-component="tag"
                class="box-border inline-flex items-center justify-center gap-sm whitespace-nowrap text-caption font-bold h-sz-20 px-md rounded-full border-sm border-current text-support ml-sm">
                ${spaceDigits(reduction)} € (${percentReduceDisplay}%)
            </span>
        </div>
        `.trim());
    }

    function displayCurrentPriceInElement(element, id, currentPrice) {
        // Fallback si pas d'ancien prix mais qu'on veut normaliser l'affichage
        const exist = element.querySelector('[id^="old_price_to_display_"]');
        if (exist) exist.parentElement.removeChild(exist);

        const priceContainer = element.querySelectorAll('[data-qa-id="adview_price"], [data-test-id="price"]')[0];
        if(!priceContainer) return;

        priceContainer.setAttribute('style', 'display:none !important');
        priceContainer.insertAdjacentHTML('beforebegin', `
        <div id="old_price_to_display_${id}" class="flex flex-wrap items-center mr-md">
            <div class="mr-md flex flex-wrap items-center justify-between">
                <div class="flex">
                    <p class="text-headline-2">${spaceDigits(currentPrice)}&nbsp;€</p>&nbsp;
                </div>
            </div>
        </div>`.trim());
    }

    function createDivOldDate(id, currentDateClass, oldDate, currentDate) {
        const divOldDate = document.createElement("div");
        divOldDate.setAttribute("id", "old_date_to_display_" + id);
        divOldDate.setAttribute("class", "flex flex-wrap items-center");

        const pOldDate = document.createElement("p");
        pOldDate.setAttribute("class", currentDateClass);
        pOldDate.innerHTML = "Mise en ligne le " + dateFormatter(new Date(oldDate));

        divOldDate.appendChild(pOldDate);

        if (oldDate !== currentDate) {
            const pCurrentDate = document.createElement("p");
            pCurrentDate.setAttribute("class", currentDateClass);
            pCurrentDate.innerHTML = "Mise à jour le " + dateFormatter(new Date(currentDate));

            divOldDate.appendChild(pCurrentDate);
            divOldDate.setAttribute("class", "flex flex-col");
        }
        return divOldDate;
    }

    function createDateTag(preText, date) {
        const tag = document.createElement("span");
        const gap = getGapWithToday(date);
        tag.setAttribute("class", ("box-border default:inline-flex default:w-fit items-center justify-center gap-sm whitespace-nowrap text-caption font-bold px-md h-sz-20 rounded-full text-on-support-container mr-md " + (gap.inDays > 30 ? 'bg-alert' : 'bg-support-container')));
        tag.setAttribute("data-spark-component", "tag");
        tag.style.backgroundColor = gap.inDays > 30 ? '#ffcccc' : '#e0e0e0'; // Fallback style simple
        tag.style.color = 'black';
        tag.style.padding = '2px 8px';
        tag.style.borderRadius = '12px';
        tag.style.marginRight = '5px';
        tag.style.fontSize = '12px';

        try {
            tag.innerHTML = preText + date.toLocaleDateString("fr-FR", {
                year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
            }).replace(/\s+/g, ' à ') + gap.asString;
        } catch (e) { err(e); }

        return tag;
    }

    function enhanceAdMileage(adItem) {
        const pMileage = document.evaluate(".//p[text()='Kilométrage']", adItem, null, XPathResult.ANY_TYPE, null).iterateNext()?.nextSibling;
        if (pMileage && !pMileage.getAttribute('data-formatted')) {
            pMileage.innerHTML = spaceDigits(pMileage.innerHTML);
            pMileage.setAttribute('data-formatted', 'true');
        }
    }

    // --- Helpers de déplacement (Nettoyage de l'interface) ---
    function moveAutoviza(article) {
        const divAutoviza = document.evaluate("//h2[contains(., 'Autoviza')]", article, null, XPathResult.ANY_TYPE, null).iterateNext()?.parentElement;
        moveDivAside(article, divAutoviza, "autoviza");
    }
    function moveProtection(article) {
        const divProtection = document.evaluate("//section[contains(., 'Protection leboncoin')]", article, null, XPathResult.ANY_TYPE, null).iterateNext();
        moveDivAside(article, divProtection, "protection");
    }
    function moveProtectionVoyageur(article) {
        const divProtectionVoyageur = document.evaluate("//h2[contains(., 'Protection Voyageur')]", article, null, XPathResult.ANY_TYPE, null).iterateNext()?.parentElement?.parentElement;
        moveDivAside(article, divProtectionVoyageur, "protectionVoyageur");
    }
    function movePackSerenite(article) {
        const divPackSerenite = document.evaluate("//p[contains(., 'Pack Sérénité*')]", article, null, XPathResult.ANY_TYPE, null).iterateNext()?.parentElement?.parentElement;
        moveDivAside(article, divPackSerenite, "packseren");
    }
    function moveLesPLus(article) {
        const divLesPlus = document.evaluate("//h2[contains(., 'Les + de cette annonce')]", article, null, XPathResult.ANY_TYPE, null).iterateNext()?.parentElement;
        moveDivAside(article, divLesPlus, "lesplus");
    }

    function moveDivAside(container, div, type) {
        if (div && !document.querySelector(`[lbc_old_price_move='${type}']`)) {
            div.classList.remove("py-xl","border-b-sm","border-outline");
            const asideRefSection = container.querySelector("aside section");
            if(asideRefSection){
                const newDiv = document.createElement("div");
                newDiv.setAttribute(`lbc_old_price_move`,type);
                newDiv.innerHTML = `<div class='${asideRefSection.classList}'></div>`;
                newDiv.firstChild.appendChild(div);
                asideRefSection.after(newDiv);
            }
        }
    }

    function enhanceAdviewSticky() {
        const adviewSticky = document.querySelector("[data-test-id='adview_container']");
        if (adviewSticky && !adviewSticky.classList?.contains("cursor-pointer")) {
            adviewSticky.classList.add("cursor-pointer");
            adviewSticky.setAttribute("style", "width: -webkit-fill-available");
        }
    }

    // --- Helpers Utilitaires ---
    function getPostId() { return getAdId(window.location.href); }
    function getAdId(url) { return url.split("/").pop().split('.')[0]; }
    function spaceDigits(digits) { return (digits + "").replaceAll(/\B(?=(\d{3})+(?!\d))/g, " "); }
    function err(a) { console.error("[LBC_Old_Price | ERROR] - ", a); }
    function log(a) { console.log("[LBC_Old_Price | INFO] - ", a); }

    function monthDiff(d1, d2) {
        var months;
        months = (d2.getFullYear() - d1.getFullYear()) * 12;
        months -= d1.getMonth();
        months += d2.getMonth();
        return months <= 0 ? 0 : months;
    }

    function dateFormatter(dateObj) {
        const day = dateObj.getDate().toString().padStart(2, '0');
        const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
        const year = dateObj.getFullYear();
        const hour = dateObj.getHours().toString().padStart(2, '0');
        const minutes = dateObj.getMinutes().toString().padStart(2, '0');
        return `${day}/${month}/${year} à ${hour}h${minutes}` + getGapWithToday(dateObj).asString;
    }

    function getGapWithToday(date) {
        const gapInMs = new Date().getTime() - date.getTime();
        const gapInDays = Math.floor(gapInMs / (1000 * 60 * 60 * 24));
        var gapString = "";
        if (gapInDays > 1) gapString += ` (${gapInDays} jours)`;
        else if (gapInDays == 1) gapString += ` (Hier)`;
        else if (gapInDays == 0) gapString += (date.getDate() === new Date().getDate()) ? ` (Aujourd'hui)` : ` (Hier)`;
        return {inDays: gapInDays, inMs: gapInMs, asString: gapString};
    }

    function getPinSvgElement() {
        return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="w-sz-16 h-sz-16 mr-sm inline-block" style="width:16px;height:16px;display:inline-block;vertical-align:text-bottom;"><path fill-rule="evenodd" clip-rule="evenodd" d="M15.3754 8.89783C15.3754 10.7038 13.8643 12.1678 12.0003 12.1678C10.1363 12.1678 8.6252 10.7038 8.6252 8.89783C8.6252 7.09187 10.1363 5.62785 12.0003 5.62785C13.8643 5.62785 15.3754 7.09187 15.3754 8.89783ZM13.3044 8.89783C13.3044 9.59562 12.7205 10.1613 12.0003 10.1613C11.2801 10.1613 10.6962 9.59562 10.6962 8.89783C10.6962 8.20004 11.2801 7.63437 12.0003 7.63437C12.7205 7.63437 13.3044 8.20004 13.3044 8.89783Z"></path><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2.00024C7.58172 2.00024 4 5.47039 4 9.75102C4 10.8868 4.41304 12.2052 4.97459 13.4754C5.5461 14.7681 6.31556 16.1078 7.12222 17.3163C7.92805 18.5235 8.78895 19.6265 9.55506 20.44C9.9359 20.8445 10.3142 21.1998 10.6676 21.4625C10.8442 21.5938 11.0353 21.7176 11.2346 21.8123C11.4223 21.9016 11.6899 22.0002 12 22.0002C12.3101 22.0002 12.5777 21.9016 12.7654 21.8123C12.9647 21.7176 13.1558 21.5938 13.3324 21.4625C13.6858 21.1998 14.0641 20.8445 14.4449 20.44C15.211 19.6265 16.0719 18.5235 16.8778 17.3163C17.6844 16.1078 18.4539 14.7681 19.0254 13.4754C19.587 12.2052 20 10.8868 20 9.75102C20 5.47039 16.4183 2.00024 12 2.00024ZM6.07104 9.75102C6.07104 6.57856 8.72552 4.00676 12 4.00676C15.2745 4.00676 17.929 6.57856 17.929 9.75102C17.929 10.4785 17.6468 11.4975 17.1217 12.6853C16.6065 13.8506 15.8978 15.0894 15.1387 16.2266C14.3788 17.3651 13.5862 18.3749 12.915 19.0877C12.5772 19.4464 12.2909 19.7076 12.0715 19.8707C12.0456 19.89 12.0218 19.907 12 19.922C11.9782 19.907 11.9544 19.89 11.9285 19.8707C11.7091 19.7076 11.4228 19.4464 11.085 19.0877C10.4138 18.3749 9.62122 17.3651 8.86127 16.2266C8.10215 15.0894 7.39349 13.8506 6.87834 12.6853C6.35322 11.4975 6.07104 10.4785 6.07104 9.75102Z"></path></svg>`;
    }

})();