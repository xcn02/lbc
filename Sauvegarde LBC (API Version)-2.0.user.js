// ==UserScript==
// @name         Sauvegarde LBC (API Version)
// @namespace    http://tampermonkey.net/
// @version      2
// @description  Sauvegarde l'annonce complète (via API) 
// @author       OptiPanda
// @match        https://www.leboncoin.fr/ad/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    const DELAY_BETWEEN_IMAGES = 600; // Délai entre chaque image (ms) pour éviter les blocages navigateurs

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
            // A. Récupération de l'ID et des données API
            const adId = window.location.href.split("/").pop().split('.')[0];
            const data = await getApiData(adId);

            if (!data) throw new Error("Impossible de récupérer les données API");

            // B. Préparation des variables
            const rawTitle = data.subject;
            const safeFilename = rawTitle.replace(/[\\/:*?"<>|]/g, '-').substring(0, 50).trim();
            const images = data.images.urls; 
            const description = data.body;
            const price = data.price ? data.price[0] : "Non défini";
            const url = window.location.href;
            const datePubli = data.first_publication_date;

            // C. Sauvegarde du fichier TXT
            button.innerHTML = '📄 Sauvegarde Texte...';
            saveTextFile(safeFilename, rawTitle, price, description, url, datePubli);

            // D. Sauvegarde des images (Lancée immédiatement)
            await saveAllImagesSequentially(safeFilename, images, button);

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

    // --- HELPER : API ---
    function getApiData(postId) {
        return fetch(`https://api.leboncoin.fr/finder/classified/${postId}`)
            .then(res => res.json())
            .catch(err => { console.error(err); return null; });
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

    // 4. Sauvegarde des images
    async function saveAllImagesSequentially(safeFilename, imageUrls, button) {
        if (!imageUrls || imageUrls.length === 0) return;

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
                    onerror: () => resolve() 
                });
            });
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_IMAGES));
        }
    }
})();
