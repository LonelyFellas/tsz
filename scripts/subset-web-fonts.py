"""Regenerate: python -m pip install 'fonttools[woff]==4.67.0', then run this file."""

from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


FONT_DIR = Path(__file__).resolve().parents[1] / "packages/shared/src/fonts"
LATIN = list(range(0x100))

for source, family, target_name, style, characters, weight in (
    ("Andika-Regular", "TSZ Common Words", "TSZCommonWords-Regular", "Regular", LATIN + list(range(0x250, 0x370)), None),
    ("Andika-Bold", "TSZ Common Words", "TSZCommonWords-Bold", "Bold", LATIN, None),
    ("Geist-Regular", "TSZ Common Text", "TSZCommonText-Regular", "Regular", LATIN + list(range(0x2000, 0x2070)), 400),
    ("Geist-Regular", "TSZ Common Text", "TSZCommonText-Bold", "Bold", LATIN + list(range(0x2000, 0x2070)), 800),
):
    font = TTFont(FONT_DIR / f"{source}.woff2", recalcTimestamp=False)
    if weight is not None:
        # fonts.css already fixes these two weights. No unused variable axis
        # needs to be downloaded for either of the existing text styles.
        font = instantiateVariableFont(font, {"wght": weight})
    options = subset.Options()
    options.layout_features = ["*"]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=characters)
    subsetter.subset(font)
    # Keep Latin and IPA together to preserve kerning across the two ranges.
    # OFL reserves original family names: rename derivatives, keeping licenses.
    for name in font["name"].names:
        value = {
            1: family,
            3: f"{family} {style} subset",
            4: f"{family} {style}",
            6: target_name,
            16: family,
            21: family,
        }.get(name.nameID)
        if value is not None:
            name.string = value.encode(name.getEncoding())
    font.flavor = "woff2"
    target = FONT_DIR / f"{target_name}.woff2"
    font.save(target)
    print(f"{target.name}: {target.stat().st_size} bytes")
