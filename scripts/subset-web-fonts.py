"""Regenerate: python -m pip install 'fonttools[woff]==4.67.0', then run this file."""

from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables.otBase import USE_HARFBUZZ_REPACKER
from fontTools.varLib.instancer import instantiateVariableFont


FONT_DIR = Path(__file__).resolve().parents[1] / "packages/shared/src/fonts"
LATIN = list(range(0x100))
# English IPA accepted by unified-phonetic.ts, including connected affricates.
# Other IPA and extended Latin continue to use the original complete font.
ENGLISH_IPA = [ord(char) for char in "ŋθɑʒɡʃʌɔəɛɪɒʊɜɹɻɚɝɾʔːˈˌʲʷʸ̩͡ʧʤ"]
LATIN_MARKS = [0x0300, 0x0301, 0x0302, 0x0303, 0x0308, 0x030A, 0x0327]
WORD_FEATURES = ["cv01", "cv04", "cv06", "cv09", "cv31", "cv39", "cv52", "ss05"]
TEXT_FEATURES = ["ss04", "ss07", "ss08"]

for source, family, target_name, style, characters, weight in (
    ("Andika-Regular", "TSZ Common Words", "TSZCommonWords-Regular", "Regular", LATIN + ENGLISH_IPA + LATIN_MARKS, None),
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
    # Preserve standard shaping plus every feature enabled by web fonts.css.
    # Unused stylistic alternatives otherwise keep thousands of extra glyphs.
    options.layout_features += ["tnum"] + (WORD_FEATURES if weight is None else TEXT_FEATURES)
    # Use the same repacker even when optional HarfBuzz bindings are installed.
    font.cfg[USE_HARFBUZZ_REPACKER] = False
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=characters)
    subsetter.subset(font)
    # Keep Latin and supported English IPA together to preserve their kerning.
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
