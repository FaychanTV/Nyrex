const { ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');

/** Calcule le numéro de semaine ISO */
function getISOWeek(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
    return Math.ceil((((date - yearStart) / 86400000) + 1)/7);
}

/** Fonction générique de scan de salon */
async function scanChannel(channel, lastMessageId, existingIdsSet, processCallback) {
    let stopId = lastMessageId;
    let newLatestId = null;
    let cursor = null;
    let hasMore = true;
    let addedCount = 0;
    const newItems = [];

    while (hasMore) {
        const options = { limit: 100 };
        if (cursor) options.before = cursor;
        
        const messages = await channel.messages.fetch(options);
        if (messages.size === 0) {
            hasMore = false;
            break;
        }

        const sortedMsgs = messages.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
        if (!newLatestId && !cursor) newLatestId = sortedMsgs.first().id;

        for (const [id, msg] of sortedMsgs) {
            if (stopId && id === stopId) {
                hasMore = false;
                break;
            }
            if (existingIdsSet.has(id)) continue;

            const result = await processCallback(msg);
            if (result) {
                if (Array.isArray(result)) {
                    newItems.push(...result);
                    addedCount += result.length;
                } else {
                    newItems.push(result);
                    addedCount++;
                }
            }
        }
        cursor = sortedMsgs.last().id;
    }

    return { newLatestId, newItems, addedCount };
}

/** Recherche un membre (DB ou Cache) */
async function resolveMemberTarget(message, args, membersDb) {
    let target = { id: message.author.id, user: message.author, name: message.author.displayName, isRawSearch: false };

    if (args.length > 0) {
        const mention = message.mentions.users.first();
        if (mention) {
            target.id = mention.id;
            target.user = mention;
            const m = membersDb.members.find(mem => mem.id === target.id);
            if (m) target.name = m.displayName;
            else target.name = target.user.displayName;
        } else if (/^\d{17,19}$/.test(args[0])) {
            target.id = args[0];
            try { 
                target.user = await message.client.users.fetch(target.id); 
                const m = membersDb.members.find(mem => mem.id === target.id);
                if (m) target.name = m.displayName;
                else target.name = target.user.displayName;
            } catch {
                target.user = null;
                target.name = "ID: " + target.id;
            }
        } else {
            const query = args.join(' ').toLowerCase();
            const member = membersDb.members.find(m => 
                (m.displayName && m.displayName.toLowerCase().includes(query)) || 
                (m.username && m.username.toLowerCase().includes(query))
            );

            if (member) {
                target.id = member.id;
                target.name = member.displayName;
                try { target.user = await message.client.users.fetch(target.id); } catch { target.user = null; }
            } else {
                target.isRawSearch = true;
                target.id = null;
                target.user = null;
                target.name = args.join(' ');
            }
        }
    } else {
        const m = membersDb.members.find(mem => mem.id === target.id);
        if (m) target.name = m.displayName;
    }
    return target;
}

/** Génère les menus déroulants Année/Mois/Semaine */
function generatePeriodSelects(items, year, month, week, idPrefix) {
    const years = [...new Set(items.map(i => new Date(i.date).getFullYear()))].sort((a, b) => b - a);
    const yearOptions = years.length > 0 ? years.map(y => ({ label: `${y}`, value: `${y}`, default: y === year })) : [{ label: `${year}`, value: `${year}`, default: true }];
    const yearSelect = new StringSelectMenuBuilder().setCustomId(`${idPrefix}_year`).setPlaceholder(years.length > 0 ? 'Année' : 'Aucune donnée').setDisabled(years.length === 0).addOptions(yearOptions);

    const allMonths = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    const monthsWithData = [...new Set(items.filter(i => new Date(i.date).getFullYear() === year).map(i => new Date(i.date).getMonth()))].sort((a, b) => a - b);
    const monthOptions = monthsWithData.map(mIndex => ({ label: allMonths[mIndex], value: `${mIndex}`, default: mIndex === month }));
    const monthSelect = new StringSelectMenuBuilder().setCustomId(`${idPrefix}_month`).setPlaceholder(monthsWithData.length > 0 ? 'Mois' : 'Aucune donnée').setDisabled(monthsWithData.length === 0).addOptions(monthOptions.length > 0 ? monthOptions : [{label: '...', value: 'placeholder'}]);

    const weeksInMonth = [...new Set(items.filter(i => { const d = new Date(i.date); return d.getFullYear() === year && d.getMonth() === month; }).map(i => getISOWeek(new Date(i.date))))].sort((a, b) => a - b);
    const weekOptions = [{ label: "Tout le mois", value: "all", default: week === 'all' }];
    weeksInMonth.forEach(w => weekOptions.push({ label: `Semaine ${w}`, value: `${w}`, default: week === w }));
    const weekSelect = new StringSelectMenuBuilder().setCustomId(`${idPrefix}_week`).setPlaceholder(weeksInMonth.length > 0 ? 'Semaine' : 'Aucune donnée').setDisabled(weeksInMonth.length === 0).addOptions(weekOptions.length > 1 ? weekOptions : [{label: '...', value: 'placeholder'}]);

    return [new ActionRowBuilder().addComponents(yearSelect), new ActionRowBuilder().addComponents(monthSelect), new ActionRowBuilder().addComponents(weekSelect)];
}

/** Gestionnaire d'interaction pour les stats (Année/Mois/Semaine) */
async function startStatsCollector(message, replyMsg, dataItems, embedGenerator, idPrefix) {
    const now = new Date();
    let selectedYear, selectedMonth, selectedWeek;

    if (dataItems.length > 0) {
        const lastDate = new Date(Math.max(...dataItems.map(i => i.date)));
        selectedYear = lastDate.getFullYear();
        selectedMonth = lastDate.getMonth();
        selectedWeek = getISOWeek(lastDate);
    } else {
        selectedYear = now.getFullYear();
        selectedMonth = now.getMonth();
        selectedWeek = getISOWeek(now);
    }

    const updateView = async (i = null) => {
        const embed = embedGenerator(selectedYear, selectedMonth, selectedWeek);
        const components = generatePeriodSelects(dataItems, selectedYear, selectedMonth, selectedWeek, idPrefix);
        const payload = { content: null, embeds: [embed], components };
        
        if (i) await i.update(payload);
        else if (replyMsg) await replyMsg.edit(payload);
        else replyMsg = await message.reply(payload);
    };

    await updateView();

    const collector = replyMsg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 300000 });
    collector.on('collect', async i => {
        if (i.user.id !== message.author.id) return i.reply({ content: "Ce menu n'est pas pour vous.", ephemeral: true });
        const val = i.values[0];
        if (val === 'placeholder') return i.deferUpdate();

        if (i.customId === `${idPrefix}_year`) selectedYear = parseInt(val);
        else if (i.customId === `${idPrefix}_month`) { selectedMonth = parseInt(val); selectedWeek = 'all'; }
        else if (i.customId === `${idPrefix}_week`) selectedWeek = val === 'all' ? 'all' : parseInt(val);

        await updateView(i);
    });

    collector.on('end', () => { if (replyMsg.editable) replyMsg.edit({ components: [] }).catch(() => {}); });
}

module.exports = {
    getISOWeek,
    scanChannel,
    resolveMemberTarget,
    generatePeriodSelects,
    startStatsCollector
};
