-- Allow legends discovered from OCR/text-only extraction without a cropped symbol image.
ALTER TABLE project_legend_symbols
  ALTER COLUMN symbol_image DROP NOT NULL;

