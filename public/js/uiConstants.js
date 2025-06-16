// public/js/uiConstants.js

export const DESIGNS = {
    'Wired': 'design-wired',
    'Mecha Manual': 'design-mecha-manual'
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
    'Digital Hazard': 'palette-mecha-digital-hazard'
};

export const DESIGN_SPECIFIC_PALETTES = {
    'design-wired': ['Cyber Default', 'Lain', 'Bebop Jazz', 'Ghost Protocol', 'Neon Noir'],
    'design-mecha-manual': ['Heavy Industry', 'Hangar Bay', 'Olive Drab Unit', 'System Alert', 'Digital Hazard']
};

export const DESIGN_DEFAULT_PALETTES = {
    'design-wired': PALETTES['Cyber Default'],
    'design-mecha-manual': PALETTES['Heavy Industry']
};

export const TYPEWRITER_SPEED = 35;
export const SCRAMBLE_CYCLES = 5;
export const CHAR_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()[]{}<>';