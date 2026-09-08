/**
 * Nettoie et parse un montant en nombre flottant.
 * @param {string} str - La chaîne contenant le montant.
 * @returns {number} Le montant parsé.
 */
function parseAmount(str) {
    if (!str) return 0;
    let s = str.replace(/\s/g, ''); // Enlever les espaces
    // Si . et , sont présents, on suppose que . est le séparateur de milliers
    if (s.includes('.') && s.includes(',')) s = s.replace(/\./g, ''); 
    return parseFloat(s.replace(',', '.'));
}

/** 
 * Formate un montant en chaîne avec séparateur de milliers '.' et décimales ',' (ex: 1.000,00)
 * @param {number|string} value - Le montant à formater
 * @returns {string} Le montant formaté
 */
function formatMoney(value) {
    if (value == null || isNaN(Number(value))) return '0,00';
    const n = Number(value);
    const negative = n < 0;
    const abs = Math.abs(n).toFixed(2); // Toujours deux décimales
    let [intPart, decPart] = abs.split('.');
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (negative ? '-' : '') + intPart + ',' + decPart;
}

module.exports = {
    parseAmount,
    formatMoney
};
