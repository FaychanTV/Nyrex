const fs = require('fs');
const path = require('path');

class JsonDB {
    constructor(filePath, defaults = {}) {
        this.filePath = path.resolve(filePath);
        this.defaults = defaults;
        this.backupPath = this.filePath + '.bak';
    }

    load() {
        if (fs.existsSync(this.filePath)) {
            try {
                const fileContent = fs.readFileSync(this.filePath, 'utf8');
                if (fileContent.trim() === '') {
                    throw new Error('File is empty');
                }
                return { ...this.defaults, ...JSON.parse(fileContent) };
            } catch (e) {
                console.error(`[JsonDB] Erreur lecture/parse de ${this.filePath}. Tentative avec la sauvegarde.`, e);
                if (fs.existsSync(this.backupPath)) {
                    try {
                        const backupContent = fs.readFileSync(this.backupPath, 'utf8');
                        if (backupContent.trim() === '') {
                            throw new Error('Backup file is empty');
                        }
                        const backupData = JSON.parse(backupContent);
                        console.log(`[JsonDB] Restauration depuis la sauvegarde ${this.backupPath} réussie.`);
                        fs.writeFileSync(this.filePath, backupContent);
                        return { ...this.defaults, ...backupData };
                    } catch (e2) {
                        console.error(`[JsonDB] La sauvegarde ${this.backupPath} est aussi corrompue. Les données sont potentiellement perdues.`, e2);
                    }
                }
            }
        }
        console.log(`[JsonDB] Création d'une nouvelle base de données vierge pour ${this.filePath}`);
        this.save(this.defaults);
        return { ...this.defaults };
    }

    save(data) {
        const tempPath = this.filePath + '.tmp';
        try {
            fs.writeFileSync(tempPath, JSON.stringify(data, null, 4));
            
            if (fs.existsSync(this.filePath)) {
                if (fs.existsSync(this.backupPath)) {
                    try { fs.unlinkSync(this.backupPath); } catch (e) {}
                }
                fs.renameSync(this.filePath, this.backupPath);
            }

            fs.renameSync(tempPath, this.filePath);
        } catch (e) {
            console.error(`[JsonDB] Erreur d'écriture atomique pour ${this.filePath}:`, e);
            
            if (fs.existsSync(tempPath)) {
                try { fs.unlinkSync(tempPath); } catch (e2) {}
            }

            if (!fs.existsSync(this.filePath) && fs.existsSync(this.backupPath)) {
                try {
                    console.log(`[JsonDB] Tentative de restauration de la sauvegarde après erreur d'écriture.`);
                    fs.renameSync(this.backupPath, this.filePath);
                } catch (restoreError) {
                    console.error(`[JsonDB] Echec critique de la restauration de la sauvegarde. Le fichier de données est peut-être perdu.`, restoreError);
                }
            }
        }
    }
}

module.exports = JsonDB;
