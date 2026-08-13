const fs = require('fs');
const path = require('path');

const baseDir = 'c:/ai-interview/agri-ai-interview/frontend/app';
const dirs = ['dashboard', 'faq', 'foundation-course', 'onboarding', 'upload-documents'];

for (const dir of dirs) {
    const tsxPath = path.join(baseDir, dir, 'page.tsx');
    if (fs.existsSync(tsxPath)) {
        let tsxContent = fs.readFileSync(tsxPath, 'utf8');
        if (tsxContent.includes('🎫 Raise Tickets')) {
            // Replacing 🎫 with ⚠️ for issue reporting
            tsxContent = tsxContent.replace('🎫 Raise Tickets', '⚠️ Raise Tickets');
            fs.writeFileSync(tsxPath, tsxContent);
            console.log(`Updated TSX: ${tsxPath}`);
        }
    }
}
