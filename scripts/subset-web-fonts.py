"""Regenerate: python -m pip install 'fonttools[woff]==4.67.0', then run this file."""

from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont


FONT_DIR = Path(__file__).resolve().parents[1] / "packages/shared/src/fonts"

for style in ("Regular", "Bold"):
    font = TTFont(FONT_DIR / f"Andika-{style}.woff2", recalcTimestamp=False)
    options = subset.Options()
    # Preserve the alternate letterforms selected by fonts.css, including IPA.
    options.layout_features = ["*"]
    subsetter = subset.Subsetter(options=options)
    # The homepage uses regular IPA, while bold examples only need Latin-1.
    subsetter.populate(unicodes=range(0x370 if style == "Regular" else 0x100))
    subsetter.subset(font)
    # OFL reserves the original family name. Keep copyright/license records,
    # but give this derived font its own family, full and PostScript names.
    for name in font["name"].names:
        value = {
            1: "TSZ Common Words",
            3: f"TSZ Common Words {style} subset",
            4: f"TSZ Common Words {style}",
            6: f"TSZCommonWords-{style}",
            16: "TSZ Common Words",
            21: "TSZ Common Words",
        }.get(name.nameID)
        if value is not None:
            name.string = value.encode(name.getEncoding())
    font.flavor = "woff2"
    target = FONT_DIR / f"TSZCommonWords-{style}.woff2"
    font.save(target)
    print(f"{target.name}: {target.stat().st_size} bytes")
