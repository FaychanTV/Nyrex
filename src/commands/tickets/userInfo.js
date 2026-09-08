const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { ticketPendingForms: pendingForms } = require('../../shared');

function getUserInfoMenuPayload(userId) {
    const info = pendingForms.get(userId);
    if (!info) {
        return {
            expired: true,
            payload: { components: [{ type: 17, components: [{ type: 10, content: "❌ Session expirée. Veuillez recommencer la création du ticket." }] }], flags: MessageFlags.Ephemeral | 32768 }
        };
    }

    const isBypass = info.firstname === '-1' || info.lastname === '-1' || info.phone === '-1';
    const isPhoneValid = info.phone && (info.phone.trim() === '-1' || /^555\d{5,6}$/.test(info.phone.replace(/\s/g, '')));
    const canSubmit = isBypass || (info.firstname && info.lastname && isPhoneValid);

    const displayFirstname = info.firstname === '-1' ? '⏭️ *Ignoré*' : (info.firstname || '❌ *À renseigner*');
    const displayLastname = info.lastname === '-1' ? '⏭️ *Ignoré*' : (info.lastname || '❌ *À renseigner*');
    const displayPhone = info.phone === '-1' ? '⏭️ *Ignoré*' : (info.phone ? (isPhoneValid ? `✅ ${info.phone}` : `⚠️ Format invalide (${info.phone})`) : '❌ *À renseigner*');

    const container = { type: 17, components: [] };
    container.components.push({ type: 10, content: `**📋 Informations Requises**` });
    container.components.push({ type: 14, spacing: 1, divider: true });
    container.components.push({ type: 10, content: `Merci de compléter les informations ci-dessous via les boutons pour valider votre ticket.` });
    container.components.push({ type: 14, spacing: 1 });
    container.components.push({ type: 10, content: `👤 **Prénom :** ${displayFirstname}\n👤 **Nom :** ${displayLastname}\n📞 **Téléphone :** ${displayPhone}` });
    container.components.push({ type: 14, spacing: 1 });
    container.components.push({ type: 10, content: `*Le téléphone doit être au format : 555 000 000 /555 000 00*\n` });
    container.components.push({ type: 14, spacing: 2 });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('userinfo_btn_firstname').setLabel('Prénom').setStyle(ButtonStyle.Secondary).setEmoji('🖊️'),
        new ButtonBuilder().setCustomId('userinfo_btn_lastname').setLabel('Nom').setStyle(ButtonStyle.Secondary).setEmoji('🖊️'),
        new ButtonBuilder().setCustomId('userinfo_btn_phone').setLabel('Téléphone').setStyle(ButtonStyle.Secondary).setEmoji('📞')
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('userinfo_btn_submit').setLabel('Envoyer le ticket').setStyle(ButtonStyle.Success).setDisabled(!canSubmit)
    );

    container.components.push(row1.toJSON());
    container.components.push(row2.toJSON());

    return { payload: { components: [container], flags: MessageFlags.Ephemeral | 32768 }, expired: false, info: info };
}

async function updateUserInfoMenu(interaction, userId, isUpdate = false) {
    const { expired, payload } = getUserInfoMenuPayload(userId);
    try {
        return isUpdate ? await interaction.update(payload) : await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    } catch (error) {
        if (error.code !== 10062) console.error("Erreur updateUserInfoMenu :", error);
    }
}

function showUserInfoModal(interaction) {
    const fieldMap = {
        'userinfo_btn_firstname': { id: 'userinfo_modal_firstname', label: 'Votre Prénom' },
        'userinfo_btn_lastname':  { id: 'userinfo_modal_lastname',  label: 'Votre Nom de famille' },
        'userinfo_btn_phone':     { id: 'userinfo_modal_phone',     label: 'Votre Numéro (555...)' }
    };

    const config = fieldMap[interaction.customId];
    if (!config) return null;

    const modal = new ModalBuilder().setCustomId(config.id).setTitle(config.label);
    const input = new TextInputBuilder().setCustomId('input_value').setLabel(config.label).setStyle(TextInputStyle.Short).setRequired(true);
    
    const currentVal = pendingForms.get(interaction.user.id)?.[interaction.customId.replace('userinfo_btn_', '')];
    if (currentVal) input.setValue(currentVal);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return modal;
}

function handleUserInfoSubmit(userId) {
    const info = pendingForms.get(userId);
    if (!info) return null;

    const fn = (info.firstname && info.firstname !== '-1') ? info.firstname : '';
    const ln = (info.lastname && info.lastname !== '-1') ? info.lastname : '';
    let combinedName = `${fn} ${ln}`.trim();
    if (!combinedName) combinedName = 'Non renseigné';

    return {
        name: combinedName,
        phone: (info.phone && info.phone !== '-1') ? info.phone : 'Non renseigné'
    };
}

function isDevMode(userId) {
    const info = pendingForms.get(userId);
    return info && (info.firstname === '-1' || info.lastname === '-1' || info.phone === '-1');
}

function clearUserInfo(userId) {
    pendingForms.delete(userId);
}

function getUserInfo(userId) {
    return pendingForms.get(userId);
}

module.exports = {
    getUserInfoMenuPayload,
    updateUserInfoMenu,
    showUserInfoModal,
    handleUserInfoSubmit,
    isDevMode,
    clearUserInfo,
    getUserInfo,
    pendingForms
};
