const { 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder, 
    PermissionsBitField, 
    MessageFlags 
} = require('discord.js');
const { getISOWeek, scanChannel } = require('../utils/stats');
const { formatMoney, parseAmount } = require('../utils/format');
const { hasCommandPermission } = require('../utils/permissions');
const invoicesDb = require('../data/invoices.db');

const ITEMS_PER_PAGE = 10;
const PROFIL_BUTTON_ID = 'profil_facture';

// --- REGEX D'EXTRACTION ---
const REGEX_TAX = /(?:facture|montant|prix|total)(?: d'entreprise)?(?: de)?\s*[:=]?\s*[$€£]?\s*([0-9.,\s]+)\s*\(taxes\s+([0-9.,]+)%\)/i;
const REGEX_AMOUNT = /(?:facture|montant|prix|total)(?: d'entreprise)?(?: de)?\s*[:=]?\s*[$€£]?\s*([0-9.,\s]+)(?:$|[^0-9.,])/i;
const REGEX_CURRENCY = /(?:^|\s)(?:[$€£]\s*([0-9.,\s]+)|([0-9.,\s]+)\s*[$€£])/i;

/**
 * Extrait les informations de facturation depuis un message Discord.
 */
function extractInvoices(msg) {
    if (!msg.embeds || msg.embeds.length === 0) return [];
    const extracted = [];

    msg.embeds.forEach((embed, idx) => {
        let fullText = [
            embed.title,
            embed.description,
            ...(embed.fields || []).map(f => `${f.name}\n${f.value}`),
            embed.footer?.text
        ].filter(Boolean).join("\n") + "\n";

        let totalAmount, preTaxAmount, taxRate;

        const taxMatch = fullText.match(REGEX_TAX);
        if (taxMatch) {
            totalAmount = parseAmount(taxMatch[1]);
            taxRate = parseFloat(taxMatch[2].replace(',', '.')) / 100;
            preTaxAmount = totalAmount / (1 + taxRate);
        } else {
            let amountMatch = fullText.match(REGEX_AMOUNT);
            
            if (!amountMatch) {
                const currencyMatch = fullText.match(REGEX_CURRENCY);
                if (currencyMatch) {
                    amountMatch = [null, currencyMatch[1] || currencyMatch[2]];
                }
            }

            if (amountMatch) {
                totalAmount = parseAmount(amountMatch[1]);
            }
            preTaxAmount = totalAmount;
            taxRate = 0;
        }

        if (isNaN(totalAmount) || totalAmount === undefined) return;

        const extract = (regex) => {
            const match = fullText.match(regex);
            return match ? match[1].trim() : null;
        };

        let issuerId = extract(/playerDiscord\**[:\s]+(\d{17,19})/i) ||
                       extract(/discord\**[:\s]+<@!?(\d{17,19})/i) ||
                       extract(/discord\**[:\s]+(\d{17,19})/i) ||
                       extract(/(?:vendeur|employé|agent|émis par|par|validé par|user|pseudo)[\s\S]{0,50}?<@!?(\d{17,19})/i) ||
                       extract(/(?:vendeur|employé|agent|émis par|par|validé par|user|pseudo)[\s\S]{0,50}?(\d{17,19})/i);

        if (!issuerId) return;

        extracted.push({
            uniqueId: `${msg.id}_${idx}`,
            msgId: msg.id,
            date: msg.createdAt,
            totalAmount,
            preTaxAmount,
            taxRate,
            issuerId,
            playerNetId: extract(/playerNetId\**[:\s]+(\d+)/i),
            playerName: extract(/playerName\**[:\s]+([^\r\n]+)/i),
            playerCharacter: extract(/playerCharacter\**[:\s]+([^\r\n]+)/i),
            playerId: extract(/playerId\**[:\s]+(\d+)/i),
            jobId: extract(/jobId\**[:\s]+(\d+)/i),
            jobName: extract(/jobName\**[:\s]+([^\r\n]+)/i),
            targetPlayerNetId: extract(/targetPlayerNetId\**[:\s]+(\d+)/i),
            targetPlayerDiscord: extract(/targetPlayerDiscord\**[:\s]+(\d{17,19})/i),
            targetPlayerName: extract(/targetPlayerName\**[:\s]+([^\r\n]+)/i),
            targetPlayerCharacter: extract(/targetPlayerCharacter\**[:\s]+([^\r\n]+)/i),
            targetPlayerId: extract(/targetPlayerId\**[:\s]+(\d+)/i),
        });
    });

    return extracted;
}

function processInvoices(invoices) {
    const sortedInvoices = invoices.sort((a, b) => new Date(b.date) - new Date(a.date));
    const weeksMap = new Map();

    sortedInvoices.forEach(inv => {
        const d = new Date(inv.date);
        const week = getISOWeek(d);
        const year = d.getFullYear();
        const key = `${week}-${year}`;

        if (!weeksMap.has(key)) {
            weeksMap.set(key, { 
                id: key, 
                year, 
                week, 
                invoices: [], 
                total: 0, 
                totalHT: 0 
            });
        }
        
        const group = weeksMap.get(key);
        group.invoices.push(inv);
        group.total += Number(inv.totalAmount) || 0;
        group.totalHT += Number(inv.preTaxAmount) || 0;
    });

    return Array.from(weeksMap.values())
        .sort((a, b) => (b.year - a.year) || (b.week - a.week));
}

function generateDetailView(inv, target, weekData, sortedWeeks, state, displayedInvoices, totalPages) {
    const container = { type: 17, components: [] };

    if (target.avatar) {
        container.components.push({ type: 12, items: [{ media: { url: target.avatar } }] });
    }

    const safeTotal = inv.totalAmount || 0;
    const safeHT = inv.preTaxAmount || 0;
    const safeTax = inv.taxRate || 0;
    const dateTs = Math.floor(new Date(inv.date).getTime() / 1000);

    container.components.push({
        type: 10,
        content: `**🧾 Détail de la Facture**\n` +
                 `**Émetteur :** ${inv.playerCharacter || inv.playerName || 'Inconnu'}\n` +
                 `**Client :** ${inv.targetPlayerCharacter || inv.targetPlayerName || 'Inconnu'}`
    });

    container.components.push({
        type: 10,
        content: `💰 Montant (TTC): ${formatMoney(safeTotal)} $\n` +
                 `💰 Montant (HT): ${formatMoney(Math.round(safeHT))} $\n` +
                 `💸 Poche (30% HT): ${formatMoney(Math.round(safeHT * 0.30))} $\n` +
                 ` Taxe: ${(safeTax * 100).toFixed(0)}%`
    });

    container.components.push({
        type: 10,
        content: `🏢 Entreprise: ${inv.jobName || 'N/A'}\n` +
                 `👤 Client (ID): ${inv.targetPlayerId || 'N/A'}\n` +
                 `👤 Vendeur (ID): ${inv.playerId || 'N/A'}`
    });

    container.components.push({
        type: 10,
        content: ` Date: ${!isNaN(dateTs) ? `<t:${dateTs}:F>` : 'Date Invalide'}\n` +
                 `🆔 ID Message: ${inv.msgId}`
    });

    container.components.push({ type: 10, content: `Semaine ${weekData.week} - ${weekData.year}` });

    generateInteractiveComponents(sortedWeeks, state, displayedInvoices, totalPages)
        .forEach(row => container.components.push(row.toJSON()));

    return container;
}

function generateListView(weekData, target, state, displayedInvoices, totalPages, scanError, sortedWeeks) {
    const container = { type: 17, components: [] };
    const start = state.page * ITEMS_PER_PAGE;
    const currentItems = displayedInvoices.slice(start, start + ITEMS_PER_PAGE);
    
    const dayToCalc = state.day || new Date().toLocaleDateString('fr-FR');
    const dailyLabel = state.day ? `CA du ${state.day.slice(0, 5)}` : "CA Aujourd'hui";

    const dailyTotal = Math.round(weekData.invoices
        .filter(inv => new Date(inv.date).toLocaleDateString('fr-FR') === dayToCalc)
        .reduce((acc, curr) => acc + (Number(curr.totalAmount) || 0), 0));

    let pocketAmount = Math.round(weekData.totalHT * 0.10);
    if (pocketAmount > 240000) pocketAmount = 240000;
    const netAmount = Math.round(weekData.totalHT) - pocketAmount;

    const list = currentItems.map(inv => {
        const dateStr = new Date(inv.date).toLocaleDateString('fr-FR');
        return `📅 ${dateStr} | 👤 **${inv.targetPlayerCharacter || inv.targetId || 'Inconnu'}** | 💰 **${formatMoney(inv.totalAmount || 0)}$**`;
    }).join('\n');

    if (target.avatar) {
        container.components.push({ type: 12, items: [{ media: { url: target.avatar } }] });
    }

    container.components.push({
        type: 10,
        content: `**📊 Bilan : ${target.character} (S${weekData.week} - ${weekData.year})**`
    });

    container.components.push({ type: 14, spacing: 2 });

    container.components.push({
        type: 10,
        content: ` ${dailyLabel}: ${formatMoney(dailyTotal)} $\n` +
                 `💰 CA Semaine: ${formatMoney(Math.round(weekData.total))} $\n` +
                 `💸 Poche (10% HT): ${formatMoney(pocketAmount)} $\n` +
                 `🏦 Net HT (Reste): ${formatMoney(netAmount)} $\n` +
                 `🧾 Nombre: ${displayedInvoices.length}`
    });

    container.components.push({ type: 14, spacing: 1 });

    container.components.push({
        type: 10,
        content: `**Factures (Page ${state.page + 1}/${totalPages}) :**\n${list || "Aucune facture."}`
    });

    container.components.push({ type: 14, spacing: 1 });

    if (scanError) {
        container.components.push({ type: 10, content: `⚠️ Scan échoué - Données en cache uniquement.` });
    } else {
        container.components.push({ type: 10, content: `Utilisez le menu ci-dessous pour naviguer.` });
    }

    generateInteractiveComponents(sortedWeeks, state, displayedInvoices, totalPages)
        .forEach(row => container.components.push(row.toJSON()));

    return container;
}

function generateInteractiveComponents(sortedWeeks, state, displayedInvoices, totalPages) {
    const rows = [];
    const weekData = sortedWeeks[state.weekIndex];
    const MAX_DESC_LENGTH = 100;
    const truncate = (s) => {
        const str = String(s || '');
        if (str.length <= MAX_DESC_LENGTH) return str;
        return str.slice(0, MAX_DESC_LENGTH - 1) + '…';
    };

    const weekOptions = sortedWeeks.slice(0, 25).map((w, idx) => 
        new StringSelectMenuOptionBuilder()
            .setLabel(`Semaine ${w.week} - ${w.year}`)
            .setDescription(truncate(`CA: ${formatMoney(w.total)}$ | ${w.invoices.length} factures`))
            .setValue(idx.toString())
            .setDefault(idx === state.weekIndex)
    );
    rows.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('select_week').setPlaceholder('📅 Changer de semaine').addOptions(weekOptions)
    ));

    const uniqueDays = [...new Set(weekData.invoices.map(inv => new Date(inv.date).toLocaleDateString('fr-FR')))].reverse();
    if (uniqueDays.length > 0) {
        const dayOptions = [
            new StringSelectMenuOptionBuilder()
                .setLabel("Vue Semaine (Tout afficher)")
                .setValue("all")
                .setDefault(state.day === null)
        ];

        uniqueDays.forEach(dayStr => {
            const [dd, mm, yyyy] = dayStr.split('/');
            const dateObj = new Date(`${yyyy}-${mm}-${dd}`);
            const dayName = dateObj.toLocaleDateString('fr-FR', { weekday: 'long' });
            const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
            
            const dayTotal = weekData.invoices
                .filter(inv => new Date(inv.date).toLocaleDateString('fr-FR') === dayStr)
                .reduce((acc, curr) => acc + (Number(curr.totalAmount) || 0), 0);

            dayOptions.push(new StringSelectMenuOptionBuilder()
                .setLabel(` ${dayStr.slice(0, 5)}`)
                .setDescription(truncate(`CA: ${formatMoney(dayTotal)}$`))
                .setValue(dayStr)
                .setDefault(state.day === dayStr)
            );
        });

        rows.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('select_day').setPlaceholder('📅 Filtrer par jour').addOptions(dayOptions.slice(0, 25))
        ));
    }

    const start = state.page * ITEMS_PER_PAGE;
    const currentItems = displayedInvoices.slice(start, start + ITEMS_PER_PAGE);
    if (currentItems.length > 0) {
        const seenIds = new Set();
        const invoiceOptions = [];
        for (const inv of currentItems) {
            const id = inv.uniqueId || inv.msgId;
            if (seenIds.has(id)) continue;
            seenIds.add(id);
            invoiceOptions.push(new StringSelectMenuOptionBuilder()
                .setLabel(`${formatMoney(inv.totalAmount || 0)}$ - ${inv.targetPlayerName || inv.targetId || 'Inconnu'}`.slice(0, 100))
                .setDescription(new Date(inv.date).toLocaleDateString('fr-FR'))
                .setValue(id)
                .setDefault(id === state.invoiceId));
        }
        rows.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('select_invoice').setPlaceholder('📄 Détail facture').addOptions(invoiceOptions)
        ));
    }

    const buttonsRow = new ActionRowBuilder();
    buttonsRow.addComponents(
        new ButtonBuilder()
            .setCustomId('prev')
            .setEmoji('⬅️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(state.page === 0),
        new ButtonBuilder()
            .setCustomId('next')
            .setEmoji('➡️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(state.page >= totalPages - 1)
    );

    if (state.invoiceId) {
        buttonsRow.addComponents(
            new ButtonBuilder()
                .setCustomId('back_list')
                .setLabel('Retour à la liste')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    rows.push(buttonsRow);
    return rows;
}

async function performScan(channel, config, guildId, statusMsg) {
    await statusMsg.edit({ content: `🔄 Mise à jour des factures (Scan du salon)...`, embeds: [] });

    const existingMessageIds = await invoicesDb.getExistingMessageIds(guildId);
    const existingIds = new Set(existingMessageIds);
    
    const { newLatestId, newItems, addedCount } = await scanChannel(channel, config.lastMessageId, existingIds, async (msg) => {
        const invoices = extractInvoices(msg);
        return invoices.length > 0 ? invoices : null;
    });

    if (newItems.length > 0) {
        await invoicesDb.addInvoices(guildId, newItems);
    }
    config.lastScan = Date.now();
    if (newLatestId) config.lastMessageId = newLatestId;
    
    await invoicesDb.updateConfig(guildId, config);
    return addedCount;
}

// --- SOUS-COMMANDES ---

async function handleSet(message, args, isAdmin) {
    if (!isAdmin) return message.reply({ content: "❌ Vous n'avez pas la permission." });
    
    const channelId = args[1];
    const channel = message.guild.channels.cache.get(channelId);
    if (!channel) return message.reply({ content: "❌ ID de salon invalide ou salon introuvable." });
    
    const config = await invoicesDb.getConfig(message.guild.id);
    config.channelId = channelId;
    await invoicesDb.updateConfig(message.guild.id, config);

    return message.reply({ content: `✅ Le salon de facturation a été configuré sur <#${channelId}>.` });
}

async function handleFind(message, args) {
    let query = args[1];
    if (!query) return message.reply({ content: "❌ Veuillez indiquer un ID Discord à rechercher." });

    const match = query.match(/^<@!?(\d{17,19})>$/);
    if (match) query = match[1];

    const guildId = message.guild.id;
    const allInvoices = await invoicesDb.getAllInvoices(guildId);
    const config = await invoicesDb.getConfig(guildId);

    const results = allInvoices.filter(inv => 
        inv.issuerId === query || 
        inv.targetPlayerDiscord === query ||
        inv.msgId === query
    );

    if (results.length === 0) return message.reply({ content: "❌ Aucune facture trouvée avec cet ID." });

    results.sort((a, b) => new Date(b.date) - new Date(a.date));

    const lines = results.slice(0, 10).map(inv => {
        const role = inv.issuerId === query ? 'Vendeur' : (inv.targetPlayerDiscord === query ? 'Client' : 'Autre');
        const channelId = config.channelId || invoicesDb.DEFAULT_CHANNEL_ID;
        const link = `https://discord.com/channels/${message.guild.id}/${channelId}/${inv.msgId}`;
        return `📅 <t:${Math.floor(new Date(inv.date).getTime()/1000)}:d> | 💰 **${formatMoney(inv.totalAmount)}$** | ${role}\n🔗 Lien vers la facture`;
    });

    const container = { type: 17, components: [] };
    container.components.push({ type: 10, content: `**🔍 Recherche de factures**` });
    container.components.push({ type: 14, spacing: 1, divider: true });
    container.components.push({ type: 10, content: `**${results.length}** facture(s) trouvée(s).` });
    container.components.push({ type: 14, spacing: 1 });
    container.components.push({ type: 10, content: `**Résultats :**\n${lines.join('\n\n') || 'Aucun'}` });
    container.components.push({ type: 14, spacing: 2 });
    container.components.push({ type: 10, content: `*Affichage des 10 plus récentes*` });

    return message.reply({ components: [container], flags: 32768 });
}

async function handleRescan(message, args, isAdmin) {
    if (!isAdmin) return message.reply({ content: "❌ Vous n'avez pas la permission." });

    const guildId = message.guild.id;
    const config = await invoicesDb.getConfig(guildId);

    if (args[1] === 'full') {
        await invoicesDb.clearInvoices(guildId);
        config.lastMessageId = null;
    } else if (args[1] && /^\d{17,19}$/.test(args[1])) {
        config.lastMessageId = args[1];
    }
    await invoicesDb.updateConfig(guildId, config);

    if (!config.channelId) return message.reply({ content: "❌ Aucun salon configuré. Utilisez `!facture set`" });
    const channel = message.guild.channels.cache.get(config.channelId);
    if (!channel) return message.reply({ content: "❌ Le salon configuré est introuvable." });

    const scanType = config.lastMessageId ? `depuis le message ${config.lastMessageId}` : (args[1] === 'full' ? "complet" : "partiel");
    const statusMsg = await message.reply({ content: `🔄 Rescan ${scanType} des factures en cours...` });

    let scanError = null;
    let addedCount = 0;
    try {
        addedCount = await performScan(channel, config, guildId, statusMsg);
    } catch (error) {
        console.error("[ERROR] Erreur lors du scan:", error);
        scanError = error;
    }

    const allInvoices = await invoicesDb.getAllInvoices(guildId);
    const desc = scanError 
        ? `⚠️ Scan échoué (${scanError.message}), mais ${allInvoices.length} factures disponibles en base.`
        : `✅ Scan terminé. **${addedCount}** nouvelles factures ajoutées. (Total: ${allInvoices.length})`;
    return statusMsg.edit({ content: desc, embeds: [] });
}

async function handleStats(message, args) {
    const guildId = message.guild.id;
    let allInvoices = await invoicesDb.getAllInvoices(guildId);
    const target = await resolveTarget(message, args, allInvoices);
    if (!target) return;

    const config = await invoicesDb.getConfig(guildId);
    if (!config.channelId) return message.reply({ content: "❌ Aucun salon configuré. Utilisez `!facture set`" });
    const channel = message.guild.channels.cache.get(config.channelId);
    if (!channel) return message.reply({ content: "❌ Le salon configuré est introuvable." });

    const statusMsg = await message.reply({ content: `🔄 Chargement des données pour ${target.name}...` });

    let scanError = null;
    try {
        await performScan(channel, config, guildId, statusMsg);
        allInvoices = await invoicesDb.getAllInvoices(guildId);
    } catch (error) {
        console.error("[ERROR] Erreur lors du scan:", error);
        scanError = error;
    }

    const allUserInvoices = allInvoices.filter(inv => {
        if (target.id && inv.issuerId === target.id) return true;
        if (target.name) {
            const tName = target.name.toLowerCase();
            const pc = inv.playerCharacter?.toLowerCase();
            const pn = inv.playerName?.toLowerCase();
            if (pc && (pc.includes(tName) || tName.includes(pc))) return true;
            if (pn && (pn.includes(tName) || tName.includes(pn))) return true;
        }
        return false;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    target.character = allUserInvoices.length > 0 ? (allUserInvoices[0].playerCharacter || target.name) : target.name;

    if (allUserInvoices.length === 0) {
        let msg = `❌ Aucune facture trouvée pour ${target.name}.`;
        if (scanError) msg += "\n⚠️ Le scan a échoué, les données peuvent être incomplètes.";
        return statusMsg.edit({ content: msg, embeds: [], components: [] });
    }

    const sortedWeeks = processInvoices(allUserInvoices);
    await startInteractiveMode(message, statusMsg, target, sortedWeeks, scanError);
}

async function resolveTarget(message, args, allInvoices) {
    let target = { id: null, name: null, avatar: null, character: null };

    if (args.length > 0) {
        const mention = message.mentions.users.first();
        if (mention) {
            target.id = mention.id;
            const member = message.guild.members.cache.get(mention.id) || await message.guild.members.fetch(mention.id).catch(() => null);
            target.name = member ? member.displayName : mention.username;
            target.avatar = mention.displayAvatarURL();
        } else if (/^\d{17,19}$/.test(args[0])) {
            target.id = args[0];
            const member = message.guild.members.cache.get(target.id) || await message.guild.members.fetch(target.id).catch(() => null);
            if (member) {
                target.name = member.displayName;
                target.avatar = member.displayAvatarURL();
            } else {
                try {
                    const u = await message.client.users.fetch(target.id);
                    target.name = u.username;
                    target.avatar = u.displayAvatarURL();
                } catch (e) {
                    const known = allInvoices.find(i => i.issuerId === target.id);
                    target.name = known ? (known.playerName || "Inconnu") : "ID: " + target.id;
                    target.avatar = null;
                }
            }
        } else {
            const query = args.join(' ').toLowerCase();
            let member = message.guild.members.cache.find(m => m.displayName.toLowerCase().includes(query));

            if (!member) {
                try {
                    const results = await message.guild.members.fetch({ query: args.join(' '), limit: 1 });
                    member = results.first();
                } catch (e) {}
            }

            if (member) {
                target.id = member.id;
                target.name = member.displayName;
                target.avatar = member.displayAvatarURL();
            } else {
                const match = allInvoices.find(i => i.playerCharacter && i.playerCharacter.toLowerCase().includes(query));
                if (match) {
                    target.id = match.issuerId;
                    target.name = match.playerName;
                    target.avatar = null;
                } else {
                    await message.reply({ content: `❌ Utilisateur "${args.join(' ')}" introuvable.` });
                    return null;
                }
            }
        }
    } else {
        target.id = message.author.id;
        target.name = message.member ? message.member.displayName : message.author.username;
        target.avatar = message.author.displayAvatarURL();
    }
    return target;
}

async function startInteractiveMode(message, statusMsg, target, sortedWeeks, scanError) {
    let state = {
        weekIndex: 0,
        day: null,
        invoiceId: null,
        page: 0
    };

    const generateContainer = () => {
        const weekData = sortedWeeks[state.weekIndex];
        
        let displayedInvoices = weekData.invoices;
        if (state.day) {
            displayedInvoices = displayedInvoices.filter(inv => 
                new Date(inv.date).toLocaleDateString('fr-FR') === state.day
            );
        }

        const totalPages = Math.ceil(displayedInvoices.length / ITEMS_PER_PAGE) || 1;

        if (state.invoiceId) {
            const inv = displayedInvoices.find(i => (i.uniqueId || i.msgId) === state.invoiceId);
            if (inv) {
                return generateDetailView(inv, target, weekData, sortedWeeks, state, displayedInvoices, totalPages);
            }
        }
        
        return generateListView(weekData, target, state, displayedInvoices, totalPages, scanError, sortedWeeks);
    };

    const updatePayload = () => ({
        content: "",
        embeds: [],
        components: [generateContainer()],
        flags: 32768
    });

    const msgResponse = await statusMsg.edit(updatePayload());

    const collector = msgResponse.createMessageComponentCollector({ time: 300000 });
    collector.on('collect', async i => {
        try {
            if (i.user.id !== message.author.id) {
                return i.reply({ content: "🚫 Vous ne pouvez pas interagir avec ce menu.", flags: MessageFlags.Ephemeral });
            }

            const actions = {
                'prev': () => { state.page--; state.invoiceId = null; },
                'next': () => { state.page++; state.invoiceId = null; },
                'back_list': () => { state.invoiceId = null; },
                'select_week': () => { state.weekIndex = parseInt(i.values[0]); state.day = null; state.page = 0; state.invoiceId = null; },
                'select_day': () => { state.day = i.values[0] === "all" ? null : i.values[0]; state.page = 0; state.invoiceId = null; },
                'select_invoice': () => { state.invoiceId = i.values[0]; }
            };

            actions[i.customId]?.();
            await i.update(updatePayload());
        } catch (e) {
            console.error("Erreur interaction facture:", e);
        }
    });

    collector.on('end', () => msgResponse.edit({ components: [] }).catch(() => {}));
}

// --- FOUILLE DE L'ARRAY EXPORT ---

const commands = [
    // Commande : panelemp (Espace employé)
    {
        name: 'panelemp',
        description: 'Affiche le panel de gestion pour les employés.',
        async execute(message) {
            const allowed = await hasCommandPermission(message.member, 'panelemp');
            if (!allowed) {
                return message.reply("❌ Vous n'avez pas la permission d'afficher ce panel.");
            }

            const container = { type: 17, components: [] };
            container.components.push({ type: 10, content: "**🏢 Espace Employé**" });
            container.components.push({ type: 14, spacing: 1, divider: true });
            container.components.push({ type: 10, content: "Bienvenue sur le panel d'entreprise. Cliquez sur le bouton ci-dessous pour accéder à vos données de facturation (Chiffre d'Affaire, Primes, etc.)." });
            container.components.push({ type: 14, spacing: 2 });
            
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('profil_facture')
                    .setLabel('Voir mes factures')
                    .setEmoji('🧾')
                    .setStyle(ButtonStyle.Success)
            );

            container.components.push(row.toJSON());

            await message.channel.send({ components: [container], flags: 32768 });
            await message.delete().catch(() => {});
        }
    },

    // Commande : facture
    {
        name: 'facture',
        profilButtonId: PROFIL_BUTTON_ID,
        description: 'Gère les factures : !facture set/rescan ou !facture @user (ou ID)',
        subcommands: [
            { name: 'set', usage: 'set <ID_SALON>', description: 'Définit le salon où scanner les factures.', adminOnly: true },
            { name: 'rescan', usage: 'rescan [ID_MESSAGE]', description: 'Force un nouveau scan des messages.', adminOnly: true },
            { name: 'find', usage: 'find <ID>', description: 'Recherche une facture par ID.' },
            { name: '[@user/ID]', usage: '[@user/ID]', description: 'Affiche les statistiques de facturation.' }
        ],
        async execute(message) {
            const args = message.content.split(' ').slice(1);
            const subcommand = args[0]?.toLowerCase();
            const isAdmin = await hasCommandPermission(message.member, 'facture'); // S'il a * ou facture en DB

            switch (subcommand) {
                case 'set':
                    return handleSet(message, args, isAdmin);
                case 'find':
                    return handleFind(message, args);
                case 'rescan':
                    return handleRescan(message, args, isAdmin);
                default:
                    return handleStats(message, args);
            }
        },

        async executeButton(interaction) {
            const fakeMessage = {
                author: interaction.user,
                member: interaction.member,
                guild: interaction.guild,
                content: '!facture',
                mentions: { users: new Map() },
                reply: async (payload) => {
                    const finalPayload = { ...payload };
                    finalPayload.flags = finalPayload.flags ? (finalPayload.flags | MessageFlags.Ephemeral) : MessageFlags.Ephemeral;
                    
                    await interaction.reply(finalPayload);
                    const replyMsg = await interaction.fetchReply(); 
                    
                    replyMsg.edit = async (editPayload) => {
                        return interaction.editReply(editPayload);
                    };
                    
                    return replyMsg;
                }
            };

            return handleStats(fakeMessage, []);
        }
    }
];

module.exports = commands;
