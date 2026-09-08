const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

function getCguContainer(type) {
    const cguText = `🏢 **Secrétariat de Nyrex Creative**\nBienvenue au service de mise en relation de Nyrex Creative. Pour garantir un traitement efficace de votre dossier et maintenir le professionnalisme de nos échanges, veuillez prendre connaissance de notre protocole :\n\n1️⃣ **Procédure de Prise de Contact**\n**Objet de la demande :** Tout ticket doit commencer par une présentation succincte (Nom, Prénom, Numéro de téléphone) et l'objet précis de votre visite.\n\n**Sérieux requis :** Nous sommes une structure professionnelle. Toute demande considérée comme "non-importante" ou farfelue sera immédiatement classée sans suite. ⚖️\n\n2️⃣ **Délais et Disponibilités**\n**Horaires d'ouverture :** Nos agents traitent les dossiers selon leurs disponibilités en ville. L'ouverture d'un ticket ne garantit pas une réponse instantanée. ⏳\n\n**Rappel de courtoisie :** Le harcèlement de nos employés (radio/téléphone) pour forcer le traitement entraînera une majoration des tarifs pour "frais de dossier urgents" ou un refus définitif de service.\n\n3️⃣ **Confidentialité et Archivage**\n**Secret Professionnel :** Tous les échanges ici sont strictement confidentiels et protégés par le secret professionnel. 📁\n\n**Traces écrites :** Conformément aux lois de la ville, une copie de cet échange sera conservée dans nos archives pour toute action juridique ultérieure.\n\n4️⃣ **Litiges et Comportement**\nTout manque de respect envers notre personnel pourra faire l'objet d'une plainte officielle auprès de la LSPD ou d'une interdiction définitive d'accès à nos locaux. 🚫`;
    
    const container = { type: 17, components: [] };
    container.components.push({ type: 10, content: cguText });
    container.components.push({ type: 14, spacing: 2 });
    
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`cgu_accept_${type}`).setLabel('✅ Lu et approuvé').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cgu_refuse').setLabel('❌ Refuser').setStyle(ButtonStyle.Danger)
    );
    container.components.push(row.toJSON());
    
    return { components: [container], flags: MessageFlags.Ephemeral | 32768 };
}

function getUserInfoInitPayload(type, userId, pendingForms, getUserInfoMenuPayload) {
    pendingForms.set(userId, {
        type: type,
        firstname: null,
        lastname: null,
        phone: null
    });
    return getUserInfoMenuPayload(userId).payload;
}

module.exports = {
    getCguContainer,
    getUserInfoInitPayload
};
