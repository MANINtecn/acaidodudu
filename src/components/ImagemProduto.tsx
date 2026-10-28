import React, { useState } from 'react';
import { miniatura } from '../services/imagemService';

/**
 * Imagem de produto para LISTAS: baixa a miniatura (~30 KB) e só cai na imagem grande se a
 * miniatura não existir (produto antigo, enviado antes da compressão). Carrega sob demanda.
 * No detalhe do produto use <img> com a imagem grande.
 */
export const ImagemProduto: React.FC<{ src: string; alt: string; className?: string }> = ({ src, alt, className }) => {
    const [usarGrande, setUsarGrande] = useState(false);
    return (
        <img
            src={usarGrande ? src : (miniatura(src) || src)}
            alt={alt}
            className={className}
            loading="lazy"
            decoding="async"
            onError={() => setUsarGrande(true)}
        />
    );
};
