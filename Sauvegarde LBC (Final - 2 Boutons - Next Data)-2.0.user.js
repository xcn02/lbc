// ==UserScript==
// @name         Sauvegarde LBC (Final - 2 Boutons - Next Data)
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Sauvegarde l'annonce (texte et images séparés) de manière ultra-fiable via l'état interne Next.js
// @author       OptiPanda
// @match        https://www.leboncoin.fr/ad/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    const DELAY_MS = 300; // Délai entre les images

    // 1. Initialisation du conteneur de boutons
    window.addEventListener('load', () => {
        let buttonContainer = document.createElement('div');
        buttonContainer.id = 'lbc-save-container-v2';

        GM_addStyle(`
            #lbc-save-container-v2 {
                position: fixed;
                top: 150px; /* Décalé vers le bas pour ne pas chevaucher l'autre script */
                right: 20px;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .lbc-save-btn {
                padding: 10px 15px;
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                font-weight: bold;
                box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                transition: opacity 0.2s;
            }
            .lbc-save-btn:hover { opacity: 0.9; }
            .lbc-save-btn:disabled { background-color: #999 !important; cursor: not-allowed; }
        `);
        document.body.appendChild(buttonContainer);

        // Bouton Texte
        let textButton = document.createElement('button');
        textButton.innerHTML = '💾 Sauver Texte';
        textButton.className = 'lbc-save-btn';
        textButton.style.backgroundColor = '#0046CF';
        textButton.onclick = () => saveContent('text', textButton);
        buttonContainer.appendChild(textButton);

        // Bouton Images
        let imgButton = document.createElement('button');
        imgButton.innerHTML = '📥 Sauver Images';
        imgButton.className = 'lbc-save-btn';
        imgButton.style.backgroundColor = '#D32B00';
        imgButton.onclick = () => saveContent('images', imgButton);
        buttonContainer.appendChild(imgButton);
    });

    // 2. Fonction de contrôle et d'orchestration
    async function saveContent(type, button) {
        button.disabled = true;
        const originalText = button.innerHTML;

        try {
            // Extraction des données de l'annonce
            const data = getNextData();
            if (!data) throw new Error("Impossible de récupérer les données de la page.");

            const rawTitle = data.subject || "Sans titre";
            const safeFilename = rawTitle.replace(/[\\/:*?"<>|]/g, '-').substring(0, 50).trim();

            if (type === 'text') {
                button.innerHTML = '🔄 Écriture...';
                saveTextFile(safeFilename, data);
            } else if (type === 'images') {
                button.innerHTML = '🔄 Extraction...';
                const images = data.images && data.images.urls ? data.images.urls : [];
                if (images.length === 0) {
                    alert("Aucune image trouvée pour cette annonce.");
                } else {
                    await saveAllImagesSequentially(safeFilename, images, button);
                }
            }

            button.innerHTML = '✅ Terminé';
            setTimeout(() => {
                button.innerHTML = originalText;
                button.disabled = false;
            }, 3000);

        } catch (error) {
            console.error(`Erreur ${type}:`, error);
            button.innerHTML = '❌ Erreur';
            setTimeout(() => {
                button.innerHTML = originalText;
                button.disabled = false;
            }, 3000);
        }
    }

    // --- HELPER : EXTRACTION DE L'ÉTAT INTERNE ---
    function getNextData() {
        const scriptJson = document.getElementById('__NEXT_DATA__');
        if (!scriptJson) return null;

        try {
            const parsed = JSON.parse(scriptJson.textContent);
            const adData = parsed.props?.pageProps?.ad;
            if (adData) return adData;

            // Recherche alternative dans le cache de requêtes
            const queries = parsed.props?.pageProps?.dehydratedState?.queries;
            if (queries) {
                for (let q of queries) {
                    if (q.state?.data?.ad) return q.state.data.ad;
                    if (q.state?.data?.subject) return q.state.data;
                }
            }
            return null;
        } catch (e) {
            console.error("Erreur de parsing __NEXT_DATA__", e);
            return null;
        }
    }

    // 3. Sauvegarde détaillée du texte
    function saveTextFile(safeFilename, data) {
        const title = data.subject || "Sans titre";
        const price = data.price && data.price[0] ? `${data.price[0]} €` : "Non défini";
        const date = data.first_publication_date || "Inconnue";
        const description = data.body || "Pas de description";
        const url = window.location.href;

        const content = `Titre: ${title}\nPrix: ${price}\nDate: ${date}\nURL: ${url}\n\n--- DESCRIPTION ---\n${description}`;

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = safeFilename + ".txt";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }

    // 4. Sauvegarde séquentielle des images
    async function saveAllImagesSequentially(safeFilename, imageUrls, button) {
        let i = 0;
        const total = imageUrls.length;

        for (const url of imageUrls) {
            // Indexation propre à deux chiffres (01, 02, etc.)
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
                        console.error(`Impossible de télécharger l'image : ${url}`);
                        i++;
                        resolve();
                    }
                });
            });
            await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
    }
})();