import React, { ReactNode, ElementType, ReactElement, ImgHTMLAttributes } from 'react';

declare const enum ModalState {
    LOADED = "LOADED",
    LOADING = "LOADING",
    UNLOADED = "UNLOADED",
    UNLOADING = "UNLOADING"
}
interface ControlledProps {
    a11yNameButtonUnzoom?: string;
    a11yNameButtonZoom?: string;
    children: ReactNode;
    classDialog?: string;
    IconUnzoom?: ElementType;
    IconZoom?: ElementType;
    isZoomed: boolean;
    onZoomChange?: (value: boolean) => void;
    wrapElement?: "div" | "span";
    ZoomContent?: (data: {
        img: ReactElement | null;
        buttonUnzoom: ReactElement<HTMLButtonElement>;
        modalState: ModalState;
        onUnzoom: () => void;
    }) => ReactElement;
    zoomImg?: ImgHTMLAttributes<HTMLImageElement>;
    zoomMargin?: number;
    disableModalCloseOnTouchMove?: boolean;
}
declare function Controlled(props: ControlledProps): React.JSX.Element;

type UncontrolledProps = Omit<ControlledProps, 'isZoomed' | 'onZoomChange'>;
declare function Uncontrolled(props: UncontrolledProps): React.JSX.Element;

export { Controlled, ControlledProps, UncontrolledProps, Uncontrolled as default };
