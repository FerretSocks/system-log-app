// public/js/uiConstants.js

export const DESIGNS = {
    'Wired': 'design-wired',
    'Mecha Manual': 'design-mecha-manual',
    'Goblins Ledger': 'design-goblins-ledger'
};

export const PALETTES = {
    // Wired Design Palettes
    'Cyber Default': 'palette-cyber-default',
    'Lain': 'palette-lain',
    'Bebop Jazz': 'palette-bebop-jazz',
    'Ghost Protocol': 'palette-ghost-protocol',
    'Neon Noir': 'palette-neon-noir',
    // Mecha Manual Design Palettes
    'Hangar Bay': 'palette-mecha-hangar',
    'Olive Drab Unit': 'palette-mecha-olive-drab',
    'Heavy Industry': 'palette-mecha-heavy-industry',
    'System Alert': 'palette-mecha-system-alert',
    'Digital Hazard': 'palette-mecha-digital-hazard',
    // Goblins Ledger Design Palettes
    'Royal Decree': 'palette-goblin-royal-decree',
    'Forest Map': 'palette-goblin-forest-map',
    'Ancient Tome': 'palette-goblin-ancient-tome',
    'Runestone Tablet': 'palette-goblin-runestone-tablet',
    "Sylvan Script": 'palette-goblin-sylvan-script'
};

export const DESIGN_SPECIFIC_PALETTES = {
    'design-wired': ['Cyber Default', 'Lain', 'Bebop Jazz', 'Ghost Protocol', 'Neon Noir'],
    'design-mecha-manual': ['Heavy Industry', 'Hangar Bay', 'Olive Drab Unit', 'System Alert', 'Digital Hazard'], // MODIFIED ORDER
    'design-goblins-ledger': ['Royal Decree', 'Forest Map', 'Ancient Tome', 'Runestone Tablet', "Sylvan Script"]
};

export const DESIGN_DEFAULT_PALETTES = {
    'design-wired': PALETTES['Cyber Default'],
    'design-mecha-manual': PALETTES['Heavy Industry'],
    'design-goblins-ledger': PALETTES['Royal Decree']
};

export const TYPEWRITER_SPEED = 35;
export const SCRAMBLE_CYCLES = 5;
export const CHAR_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()[]{}<>';