// ==UserScript==
// @name         Sauvegarde LBC (Final - 1 Bouton)
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Sauvegarde l'annonce (texte et images) avec nommage d'image propre.
// @author       Vous
// @match        https://www.leboncoin.fr/ad/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    const DELAY_MS = 500;
    const gallerySelector = 'section[aria-label="Aller à la galerie de photos"]';
    const imgSelector = 'img[src*="img.leboncoin.fr/api/v1/lbcpb1/images/"]';

    // 1. Initialisation du bouton (Décalé à gauche)
    window.addEventListener('load', () => {
        let saveButton = document.createElement('button');
        saveButton.innerHTML = '💾 Sauvegarder Annonce';
        saveButton.onclick = saveAd;

        GM_addStyle(`
            #lbc-save-button-final {
                position: fixed;
                top: 100px;
                right: 70px; /* Décalé à gauche */
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
            }
            #lbc-save-button-final:hover { background-color: #E66312; }
            #lbc-save-button-final:disabled { background-color: #999; }
        `);
        saveButton.id = 'lbc-save-button-final';
        document.body.appendChild(saveButton);
    });

    // 2. Fonction principale (orchestre le flux)
    async function saveAd() {
        const button = document.getElementById('lbc-save-button-final');
        button.innerHTML = '🔄 En cours...';
        button.disabled = true;

        try {
            // Calculer les données de nommage
            const rawTitle = document.title;
            const safeFilename = rawTitle.replace(/[\\/:*?"<>|]/g, '-').substring(0, 40);

            // --- 2.1. Sauvegarde du fichier TXT ---
            await saveTextFile(safeFilename, rawTitle);
            button.innerHTML = '📥 Images en cours...';

            // --- 2.2. Sauvegarde des images ---
            await saveAllImagesSequentially(safeFilename, button);

            // --- 2.3. Terminé ---
            button.innerHTML = '✅ Terminé !';
            setTimeout(() => {
                button.innerHTML = '💾 Sauvegarder Annonce';
                button.disabled = false;
            }, 3000);

        } catch (error) {
            console.error("Erreur lors de la sauvegarde :", error);
            button.innerHTML = '❌ Erreur';
            button.disabled = false;
        }
    }

    // 3. Fonction pour sauvegarder le fichier texte (mise à jour pour le nommage)
    async function saveTextFile(safeFilename, rawTitle) {
        // Clic sur "Voir plus"
        const buttons = Array.from(document.querySelectorAll('button'));
        const seeMoreButton = buttons.find(btn => btn.innerText.includes('Voir plus'));
        if (seeMoreButton) {
            seeMoreButton.click();
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        const title = rawTitle.replace(/ - sur leboncoin$/, '');
        const descEl = document.getElementById('readme-content');
        // Extraction du prix et insertion dans le contenu
        const priceEl = document.querySelector('[data-qa-id="adview_price"] .text-headline-1');
        const price = priceEl ? priceEl.innerText.trim() : 'PRIX-NON-TROUVÉ';
        const description = descEl ? descEl.innerText : 'DESCRIPTION-NON-TROUVÉE';

        // Création du lien de téléchargement
        const content = `Titre: ${title}\nURL: ${window.location.href}\nPrix: ${price}\n\n${description}`;        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = safeFilename + ".txt"; // Utilisation du nom de fichier propre
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }

    // 4. Fonction pour sauvegarder toutes les images (mise à jour pour le nommage)
    async function saveAllImagesSequentially(safeFilename, button) {
        const galleryContainer = document.querySelector(gallerySelector);
        if (!galleryContainer) return;

        const imageElements = galleryContainer.querySelectorAll(imgSelector);
        const imageUrls = new Set();
        for (const img of imageElements) {
            imageUrls.add(img.src.replace(/\?rule=.*$/, '?rule=ad-large'));
        }

        let i = 0;
        const total = imageUrls.size;

        for (const url of imageUrls) {
            // NOUVEAU NOMMAGE : [Titre]_image_00.jpg
            const filename = `${safeFilename}_image_${String(i).padStart(2, '0')}.jpg`;
            button.innerHTML = `📥 Image ${i+1}/${total}`;

            await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: url,
                    responseType: "blob",
                    onload: function(response) {
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(response.response);
                        link.download = filename; // Utilisation du nouveau nom
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        URL.revokeObjectURL(link.href);
                        i++;
                        resolve();
                    },
                    onerror: reject,
                    ontimeout: reject
                });
            });
            await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
    }
})();