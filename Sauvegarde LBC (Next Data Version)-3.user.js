// ==UserScript==
// @name         Sauvegarde LBC (Next Data Version)
// @namespace    http://tampermonkey.net/
// @version      3
// @description  Sauvegarde l'annonce complète via l'état interne Next.js
// @author       OptiPanda
// @match        https://www.leboncoin.fr/ad/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    const DELAY_BETWEEN_IMAGES = 250; // ms

    // 1. Initialisation du bouton
    window.addEventListener('load', () => {
        let saveButton = document.createElement('button');
        saveButton.innerHTML = '💾 Sauvegarder Annonce';
        saveButton.onclick = startProcess;

        GM_addStyle(`
            #lbc-save-button-final {
                position: fixed;
                top: 100px;
                right: 70px;
                z-index: 9999;
                padding: 10px 15px;
                background-color: #FF6E14;
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                font-weight: bold;
                box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                transition: background 0.3s;
            }
            #lbc-save-button-final:hover { background-color: #E66312; }
            #lbc-save-button-final:disabled { background-color: #999; cursor: not-allowed; }
        `);
        saveButton.id = 'lbc-save-button-final';
        document.body.appendChild(saveButton);
    });

    // 2. Fonction principale orchestratrice
    async function startProcess() {
        const button = document.getElementById('lbc-save-button-final');
        button.innerHTML = '🔄 Récupération infos...';
        button.disabled = true;

        try {
            // A. Récupération des données via le script __NEXT_DATA__ de la page
            const data = getNextData();

            if (!data) throw new Error("Impossible de trouver les données de l'annonce dans la page.");

            // B. Préparation des variables
            const rawTitle = data.subject || "Sans titre";
            const safeFilename = rawTitle.replace(/[\\/:*?"<>|]/g, '-').substring(0, 50).trim();
            const images = data.images && data.images.urls ? data.images.urls : [];
            const description = data.body || "Pas de description";
            const price = data.price && data.price[0] ? data.price[0] : "Non défini";
            const url = window.location.href;
            const datePubli = data.first_publication_date || "Inconnue";

            // C. Sauvegarde du fichier TXT
            button.innerHTML = '📄 Sauvegarde Texte...';
            saveTextFile(safeFilename, rawTitle, price, description, url, datePubli);

            // D. Sauvegarde des images
            if (images.length > 0) {
                await saveAllImagesSequentially(safeFilename, images, button);
            }

            // E. Fin
            button.innerHTML = '✅ Terminé !';
            setTimeout(() => {
                button.innerHTML = '💾 Sauvegarder Annonce';
                button.disabled = false;
            }, 3000);

        } catch (error) {
            console.error("Erreur Sauvegarde :", error);
            button.innerHTML = '❌ Erreur';
            setTimeout(() => { button.disabled = false; }, 3000);
        }
    }

    // --- HELPER : EXTRACTION DES DONNÉES INTERNES ---
    function getNextData() {
        const scriptJson = document.getElementById('__NEXT_DATA__');
        if (!scriptJson) return null;

        try {
            const parsed = JSON.parse(scriptJson.textContent);
            // On cherche l'objet de l'annonce dans les props de la page de manière dynamique
            const adData = parsed.props?.pageProps?.ad;
            if (adData) return adData;

            // Fallback si la structure a légèrement bougé (recherche récursive simplifiée)
            const queries = parsed.props?.pageProps?.dehydratedState?.queries;
            if (queries) {
                for (let q of queries) {
                    if (q.state?.data?.ad) return q.state.data.ad;
                    if (q.state?.data?.subject) return q.state.data; // l'objet est directement la data
                }
            }
            return null;
        } catch (e) {
            console.error("Erreur parsing __NEXT_DATA__", e);
            return null;
        }
    }

    // 3. Sauvegarde du texte
    function saveTextFile(safeFilename, title, price, description, url, date) {
        const content = `Titre: ${title}\nPrix: ${price} €\nDate: ${date}\nURL: ${url}\n\n--- DESCRIPTION ---\n${description}`;
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = safeFilename + ".txt";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }

    // 4. Sauvegarde des images (Utilise GM_xmlhttpRequest pour contourner le CORS des serveurs d'images)
    async function saveAllImagesSequentially(safeFilename, imageUrls, button) {
        let i = 0;
        const total = imageUrls.length;

        for (const url of imageUrls) {
            const filename = `${safeFilename}_image_${String(i + 1).padStart(2, '0')}.jpg`;
            button.innerHTML = `📥 Image ${i + 1}/${total}`;

            await new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: url,
                    responseType: "blob",
                    onload: function(response) {
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(response.response);
                        link.download = filename;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        setTimeout(() => {
                            URL.revokeObjectURL(link.href);
                            i++;
                            resolve();
                        }, 50);
                    },
                    onerror: () => {
                        console.error(`Échec du téléchargement de l'image : ${url}`);
                        i++;
                        resolve();
                    }
                });
            });
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_IMAGES));
        }
    }
})();