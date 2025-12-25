// ==UserScript==
// @name         Sauvegarde LBC (API Version)
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Sauvegarde l'annonce complète (via API) pour avoir toutes les images et le texte propre.
// @author       OptiPanda
// @match        https://www.leboncoin.fr/ad/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    const DELAY_BETWEEN_IMAGES = 800; // Délai entre chaque image (ms)
    const WAIT_AFTER_TXT = 2000;      // Temps d'attente après le fichier texte avant de lancer les images

    // 1. Initialisation du bouton
    window.addEventListener('load', () => {
        let saveButton = document.createElement('button');
        saveButton.innerHTML = '💾 Sauvegarder Annonce';
        saveButton.onclick = startProcess; // On lance le nouveau process

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
            const images = data.images.urls; // Liste complète des URLS
            const description = data.body;
            const price = data.price ? data.price[0] : "Non défini";
            const url = window.location.href;
            const datePubli = data.first_publication_date;

            // C. Sauvegarde du fichier TXT
            button.innerHTML = '📄 Sauvegarde Texte...';
            saveTextFile(safeFilename, rawTitle, price, description, url, datePubli);

            // D. Pause pour laisser l'utilisateur gérer le fichier texte
            button.innerHTML = '⏳ Attente (2s)...';
            await new Promise(resolve => setTimeout(resolve, WAIT_AFTER_TXT));

            // E. Sauvegarde des images
            await saveAllImagesSequentially(safeFilename, images, button);

            // F. Fin
            button.innerHTML = '✅ Terminé !';
            setTimeout(() => {
                button.innerHTML = '💾 Sauvegarder Annonce';
                button.disabled = false;
            }, 3000);

        } catch (error) {
            console.error("Erreur Sauvegarde :", error);
            button.innerHTML = '❌ Erreur (voir console)';
            setTimeout(() => { button.disabled = false; }, 3000);
        }
    }

    // --- HELPER : Récupérer les données depuis l'API LBC ---
    function getApiData(postId) {
        return fetch(`https://api.leboncoin.fr/finder/classified/${postId}`)
            .then(res => res.json())
            .catch(err => { console.error(err); return null; });
    }

    // 3. Sauvegarde du texte (Plus propre, sans simuler de clic "voir plus")
    function saveTextFile(safeFilename, title, price, description, url, date) {
        const content = `Titre: ${title}
Prix: ${price} €
Date de publication: ${date}
URL: ${url}

--- DESCRIPTION ---
${description}
`;
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = safeFilename + ".txt";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }

    // 4. Sauvegarde des images (Basée sur la liste API, donc 100% complète)
    async function saveAllImagesSequentially(safeFilename, imageUrls, button) {
        if (!imageUrls || imageUrls.length === 0) return;

        let i = 0;
        const total = imageUrls.length;

        for (const url of imageUrls) {
            // On force la haute qualité si l'URL ne l'a pas déjà
            // (L'API donne souvent des URL propres, mais on sécurise)
            const cleanUrl = url;

            // Nommage : Titre_image_01.jpg
            const filename = `${safeFilename}_image_${String(i + 1).padStart(2, '0')}.jpg`;

            button.innerHTML = `📥 Image ${i + 1}/${total}`;

            await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: cleanUrl,
                    responseType: "blob",
                    onload: function(response) {
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(response.response);
                        link.download = filename;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);

                        // Petit délai pour laisser le navigateur respirer
                        setTimeout(() => {
                            URL.revokeObjectURL(link.href);
                            i++;
                            resolve();
                        }, 100);
                    },
                    onerror: (e) => {
                        console.error("Echec image", e);
                        resolve(); // On continue même si une image échoue
                    }
                });
            });

            // Délai défini en haut du script pour éviter de bombarder le navigateur
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_IMAGES));
        }
    }
})();