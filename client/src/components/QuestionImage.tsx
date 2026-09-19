import { useState } from "react";

// Renders a question's optional illustration. The image is lazy-loaded and
// responsive; if the URL fails to load it hides itself so a broken-image icon
// never shows. Renders nothing when there is no URL.

interface QuestionImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
}

export function QuestionImage({ src, alt, className }: QuestionImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) return null;

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`max-w-full h-auto rounded-lg border border-border ${className ?? ""}`}
    />
  );
}

export default QuestionImage;
