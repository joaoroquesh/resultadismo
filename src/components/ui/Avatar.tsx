import { useMemo } from "react";
import { legacyToCrest } from "@/lib/crest";
import { CrestMask } from "./CrestMask";

type Size = "xs" | "sm" | "md" | "lg" | "xl";

// lado em px por tamanho (a inicial escala dentro do CrestMask)
const px: Record<Size, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
};

// Todo perfil aparece como ESCUDO. Dados antigos (foto crua do Google ou
// avatar `gen:`) são adaptados em tempo de render via legacyToCrest — ninguém
// fica sem escudo. avatar_url nulo cai no escudo padrão do nome.
export function Avatar({
  src,
  name,
  size = "md",
  className,
}: {
  src?: string | null;
  name?: string | null;
  size?: Size;
  className?: string;
}) {
  const crest = useMemo(() => legacyToCrest(src), [src]);
  return (
    <CrestMask
      src={crest}
      name={name}
      px={px[size]}
      defaultKind="escudo"
      withLetter
      className={className}
    />
  );
}
