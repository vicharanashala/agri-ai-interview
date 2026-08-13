const fs = require('fs');
const path = require('path');

const baseDir = 'c:/ai-interview/agri-ai-interview/frontend/app';
const dirs = ['faq', 'foundation-course', 'onboarding', 'upload-documents'];

const tsxReplacement = `<div className={styles.headerButtons}>
            <button
              onClick={() => window.open('/raise-ticket.html', '_blank')}
              className={styles.raiseTicketBtn}
            >
              🎫 Raise Tickets
            </button>`;

for (const dir of dirs) {
    const tsxPath = path.join(baseDir, dir, 'page.tsx');
    if (fs.existsSync(tsxPath)) {
        let tsxContent = fs.readFileSync(tsxPath, 'utf8');
        if (!tsxContent.includes('raiseTicketBtn')) {
            tsxContent = tsxContent.replace(/<div className=\{styles\.headerButtons\}>/, tsxReplacement);
            fs.writeFileSync(tsxPath, tsxContent);
            console.log(`Updated TSX: ${tsxPath}`);
        }
    }
}
