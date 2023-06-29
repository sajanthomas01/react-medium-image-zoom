import React, {
  CSSProperties,
  Component,
  ElementType,
  ImgHTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  ReactElement,
  ReactNode,
  SyntheticEvent,
  createRef,
} from "react";

import { createPortal } from "react-dom";

import type { SupportedImage } from "./types";
import { IEnlarge, ICompress } from "./icons";

import {
  getImgAlt,
  getImgSrc,
  getStyleGhost,
  getStyleModalImg,
  testDiv,
  testImg,
  testImgLoaded,
  testSvg,
} from "./utils";

// =============================================================================

let elDialogContainer: HTMLDivElement;

if (typeof document !== "undefined") {
  elDialogContainer = document.createElement("div");
  elDialogContainer.setAttribute("data-rmiz-portal", "");
  document.body.appendChild(elDialogContainer);
}

// =============================================================================

/**
 * The selector query we use to find and track the image
 */
const IMAGE_QUERY = ["img", "svg", '[role="img"]', "[data-zoom]"]
  .map((x) => `${x}:not([aria-hidden="true"])`)
  .join(",");

// =============================================================================

const enum ModalState {
  LOADED = "LOADED",
  LOADING = "LOADING",
  UNLOADED = "UNLOADED",
  UNLOADING = "UNLOADING",
}

// =============================================================================

interface BodyAttrs {
  overflow: string;
  width: string;
}

/**
 * Helps keep track of some key `<body>` attributes
 * so we can remove and re-add them when disabling and
 * re-enabling body scrolling
 */
const defaultBodyAttrs: BodyAttrs = {
  overflow: "",
  width: "",
};

// =============================================================================

export interface ControlledProps {
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

export function Controlled(props: ControlledProps) {
  return <ControlledBase {...props} />;
}

interface ControlledDefaultProps {
  a11yNameButtonUnzoom: string;
  a11yNameButtonZoom: string;
  IconUnzoom: ElementType;
  IconZoom: ElementType;
  wrapElement: "div" | "span";
  zoomMargin: number;
  disableModalCloseOnTouchMove: boolean;
}

type ControlledPropsWithDefaults = ControlledDefaultProps & ControlledProps;

interface ControlledState {
  id: string;
  isZoomImgLoaded: boolean;
  loadedImgEl: HTMLImageElement | undefined;
  modalState: ModalState;
  shouldRefresh: boolean;
}

class ControlledBase extends Component<
  ControlledPropsWithDefaults,
  ControlledState
> {
  static defaultProps: ControlledDefaultProps = {
    a11yNameButtonUnzoom: "Minimize image",
    a11yNameButtonZoom: "Expand image",
    IconUnzoom: ICompress,
    IconZoom: IEnlarge,
    wrapElement: "div",
    zoomMargin: 0,
    disableModalCloseOnTouchMove: false,
  };

  state: ControlledState = {
    id: "",
    isZoomImgLoaded: false,
    loadedImgEl: undefined,
    modalState: ModalState.UNLOADED,
    shouldRefresh: false,
  };

  private refContent = createRef<HTMLDivElement>();
  private refDialog = createRef<HTMLDialogElement>();
  private refModalContent = createRef<HTMLDivElement>();
  private refModalImg = createRef<HTMLImageElement>();
  private refWrap = createRef<HTMLDivElement>();

  private changeObserver: MutationObserver | undefined;
  private imgEl: SupportedImage | null = null;
  private imgElObserver: ResizeObserver | undefined;
  private prevBodyAttrs: BodyAttrs = defaultBodyAttrs;
  private styleModalImg: CSSProperties = {};
  private touchYStart?: number;
  private touchYEnd?: number;

  render() {
    const {
      handleDialogCancel,
      handleDialogClick,
      handleDialogKeyDown,
      handleUnzoom,
      handleZoom,
      imgEl,
      props: {
        a11yNameButtonUnzoom,
        a11yNameButtonZoom,
        children,
        classDialog,
        IconUnzoom,
        IconZoom,
        isZoomed,
        wrapElement: WrapElement,
        ZoomContent,
        zoomImg,
        zoomMargin,
      },
      refContent,
      refDialog,
      refModalContent,
      refModalImg,
      refWrap,
      state: { id, isZoomImgLoaded, loadedImgEl, modalState, shouldRefresh },
    } = this;

    const idModal = `rmiz-modal-${id}`;
    const idModalImg = `rmiz-modal-img-${id}`;

    // =========================================================================

    const isDiv = testDiv(imgEl);
    const isImg = testImg(imgEl);
    const isSvg = testSvg(imgEl);

    const imgAlt = getImgAlt(imgEl);
    const imgSrc = getImgSrc(imgEl);
    const imgSizes = isImg ? imgEl.sizes : undefined;
    const imgSrcSet = isImg ? imgEl.srcset : undefined;

    const hasZoomImg = !!zoomImg?.src;

    const hasImage =
      imgEl &&
      (loadedImgEl || isSvg) &&
      window.getComputedStyle(imgEl).display !== "none";

    const labelBtnZoom = imgAlt
      ? `${a11yNameButtonZoom}: ${imgAlt}`
      : a11yNameButtonZoom;

    const isModalActive =
      modalState === ModalState.LOADING || modalState === ModalState.LOADED;

    const dataContentState = hasImage ? "found" : "not-found";

    const dataOverlayState =
      modalState === ModalState.UNLOADED || modalState === ModalState.UNLOADING
        ? "hidden"
        : "visible";

    // =========================================================================

    const styleContent: CSSProperties = {
      visibility: modalState === ModalState.UNLOADED ? "visible" : "hidden",
    };

    const styleGhost = getStyleGhost(imgEl);

    // Share this with UNSAFE_handleSvg
    this.styleModalImg = hasImage
      ? getStyleModalImg({
          hasZoomImg,
          imgSrc,
          isSvg,
          isZoomed: isZoomed && isModalActive,
          loadedImgEl,
          offset: zoomMargin,
          shouldRefresh,
          targetEl: imgEl,
        })
      : {};

    // =========================================================================

    let modalContent = null;

    if (hasImage) {
      const modalImg =
        isImg || isDiv ? (
          <img
            alt={imgAlt}
            sizes={imgSizes}
            src={imgSrc}
            srcSet={imgSrcSet}
            {...(isZoomImgLoaded && modalState === ModalState.LOADED
              ? zoomImg
              : {})}
            data-rmiz-modal-img=""
            height={this.styleModalImg.height || undefined}
            id={idModalImg}
            ref={refModalImg}
            style={this.styleModalImg}
            width={this.styleModalImg.width || undefined}
          />
        ) : isSvg ? (
          <div
            data-rmiz-modal-img
            ref={refModalImg}
            style={this.styleModalImg}
          />
        ) : null;

      const modalBtnUnzoom = (
        <button
          aria-label={a11yNameButtonUnzoom}
          data-rmiz-btn-unzoom=""
          onClick={handleUnzoom}
          type="button"
        >
          <IconUnzoom />
        </button>
      );

      modalContent = ZoomContent ? (
        <ZoomContent
          buttonUnzoom={modalBtnUnzoom}
          modalState={modalState}
          img={modalImg}
          onUnzoom={handleUnzoom}
        />
      ) : (
        <>
          {modalImg}
          {modalBtnUnzoom}
        </>
      );
    }

    // =========================================================================

    return (
      <WrapElement aria-owns={idModal} data-rmiz="" ref={refWrap}>
        <WrapElement
          data-rmiz-content={dataContentState}
          ref={refContent}
          style={styleContent}
        >
          {children}
        </WrapElement>
        {hasImage && (
          <WrapElement data-rmiz-ghost="" style={styleGhost}>
            <button
              aria-label={labelBtnZoom}
              data-rmiz-btn-zoom=""
              onClick={handleZoom}
              type="button"
            >
              <IconZoom />
            </button>
          </WrapElement>
        )}
        {hasImage &&
          elDialogContainer != null &&
          createPortal(
            <dialog /* eslint-disable-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-redundant-roles */
              aria-labelledby={idModalImg}
              aria-modal="true"
              className={classDialog}
              data-rmiz-modal=""
              id={idModal}
              onClick={handleDialogClick}
              onClose={
                handleUnzoom /* eslint-disable-line react/no-unknown-property */
              }
              onCancel={handleDialogCancel}
              onKeyDown={handleDialogKeyDown}
              ref={refDialog}
              role="dialog"
            >
              <div data-rmiz-modal-overlay={dataOverlayState} />
              <div data-rmiz-modal-content="" ref={refModalContent}>
                {modalContent}
              </div>
            </dialog>,
            elDialogContainer
          )}
      </WrapElement>
    );
  }

  // ===========================================================================

  componentDidMount() {
    this.setId();
    this.setAndTrackImg();
    this.handleImgLoad();
    this.UNSAFE_handleSvg();
  }

  componentWillUnmount() {
    if (this.state.modalState !== ModalState.UNLOADED) {
      this.bodyScrollEnable();
    }
    this.changeObserver?.disconnect?.();
    this.imgElObserver?.disconnect?.();
    this.imgEl?.removeEventListener?.("load", this.handleImgLoad);
    this.imgEl?.removeEventListener?.("click", this.handleZoom);
    this.refModalImg.current?.removeEventListener?.(
      "transitionend",
      this.handleZoomEnd
    );
    this.refModalImg.current?.removeEventListener?.(
      "transitionend",
      this.handleUnzoomEnd
    );
    window.removeEventListener("wheel", this.handleWheel);
    window.removeEventListener("touchstart", this.handleTouchStart);
    window.removeEventListener("touchend", this.handleTouchMove);
    window.removeEventListener("touchcancel", this.handleTouchCancel);
    window.removeEventListener("resize", this.handleResize);
  }

  // ===========================================================================

  componentDidUpdate(prevProps: ControlledPropsWithDefaults) {
    this.UNSAFE_handleSvg();
    this.handleIfZoomChanged(prevProps.isZoomed);
  }

  // ===========================================================================

  /**
   * Because of SSR, set a unique ID after render
   */
  setId = () => {
    const gen4 = () => Math.random().toString(16).slice(-4);
    this.setState({ id: gen4() + gen4() + gen4() });
  };

  // ===========================================================================

  /**
   * Find and set the image we're working with
   */
  setAndTrackImg = () => {
    const contentEl = this.refContent.current;

    if (!contentEl) return;

    this.imgEl = contentEl.querySelector(IMAGE_QUERY) as SupportedImage | null;

    if (this.imgEl) {
      this.changeObserver?.disconnect?.();
      this.imgEl?.addEventListener?.("load", this.handleImgLoad);
      this.imgEl?.addEventListener?.("click", this.handleZoom);

      if (!this.state.loadedImgEl) {
        this.handleImgLoad();
      }

      this.imgElObserver = new ResizeObserver((entries) => {
        const entry = entries[0];

        if (entry?.target) {
          this.imgEl = entry.target as SupportedImage;
          this.setState({}); // Force a re-render
        }
      });

      this.imgElObserver.observe(this.imgEl);
    } else if (!this.changeObserver) {
      this.changeObserver = new MutationObserver(this.setAndTrackImg);
      this.changeObserver.observe(contentEl, {
        childList: true,
        subtree: true,
      });
    }
  };

  // ===========================================================================

  /**
   * Show modal when zoomed; hide modal when unzoomed
   */
  handleIfZoomChanged = (prevIsZoomed: boolean) => {
    const { isZoomed } = this.props;

    if (!prevIsZoomed && isZoomed) {
      this.zoom();
    } else if (prevIsZoomed && !isZoomed) {
      this.unzoom();
    }
  };

  // ===========================================================================

  /**
   * Ensure we always have the latest img src value loaded
   */
  handleImgLoad = () => {
    const { imgEl } = this;

    const imgSrc = getImgSrc(imgEl);

    if (!imgSrc) return;

    const img = new Image();

    if (testImg(imgEl)) {
      img.sizes = imgEl.sizes;
      img.srcset = imgEl.srcset;
    }

    // img.src must be set after sizes and srcset
    // because of Firefox flickering on zoom
    img.src = imgSrc;

    const setLoaded = () => {
      this.setState({ loadedImgEl: img });
    };

    img
      .decode()
      .then(setLoaded)
      .catch(() => {
        if (testImgLoaded(img)) {
          setLoaded();
          return;
        }
        img.onload = setLoaded;
      });
  };

  // ===========================================================================

  /**
   * Report that zooming should occur
   */
  handleZoom = () => {
    this.props.onZoomChange?.(true);
  };

  /**
   * Report that unzooming should occur
   */
  handleUnzoom = () => {
    this.props.onZoomChange?.(false);
  };

  // ===========================================================================

  /**
   * Prevent the browser from removing the dialog on Escape
   */
  handleDialogCancel = (e: SyntheticEvent) => {
    e.preventDefault();
  };

  // ===========================================================================

  /**
   *  Have dialog.click() only close in certain situations
   */
  handleDialogClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (
      e.target === this.refModalContent.current ||
      e.target === this.refModalImg.current
    ) {
      this.handleUnzoom();
    }
  };

  // ===========================================================================

  /**
   * Intercept default dialog.close() and use ours so we can animate
   */
  handleDialogKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === "Escape" || e.keyCode === 27) {
      e.preventDefault();
      e.stopPropagation();
      this.handleUnzoom();
    }
  };

  // ===========================================================================

  /**
   * Unzoom on wheel event
   */
  handleWheel = (e: WheelEvent) => {
    e.stopPropagation();
    queueMicrotask(() => {
      this.handleUnzoom();
    });
  };

  /**
   * Start tracking the Y-axis
   */
  handleTouchStart = (e: TouchEvent) => {
    if (e.changedTouches.length === 1 && e.changedTouches[0]) {
      this.touchYStart = e.changedTouches[0].screenY;
    }
  };

  /**
   * Track how far we've moved on the Y-axis
   * and unzoom if we detect a "swipe"
   */
  handleTouchMove = (e: TouchEvent) => {
    if (this.touchYStart != null && e.changedTouches[0]) {
      this.touchYEnd = e.changedTouches[0].screenY;

      const max = Math.max(this.touchYStart, this.touchYEnd);
      const min = Math.min(this.touchYStart, this.touchYEnd);
      const delta = Math.abs(max - min);
      const threshold = 10;

      if (delta > threshold && !this.props.disableModalCloseOnTouchMove) {
        this.touchYStart = undefined;
        this.touchYEnd = undefined;
        this.handleUnzoom();
      }
    }
  };

  /**
   * Reset the Y-axis start and end tracking points
   */
  handleTouchCancel = () => {
    this.touchYStart = undefined;
    this.touchYEnd = undefined;
  };

  // ===========================================================================

  /**
   * Force re-render on resize
   */
  handleResize = () => {
    this.setState({ shouldRefresh: true });
  };

  // ===========================================================================

  /**
   * Perform zooming actions
   */
  zoom = () => {
    this.bodyScrollDisable();
    this.refDialog.current?.showModal?.();
    this.setState({ modalState: ModalState.LOADING });
    this.loadZoomImg();

    window.addEventListener("wheel", this.handleWheel, { passive: true });
    window.addEventListener("touchstart", this.handleTouchStart, {
      passive: true,
    });
    window.addEventListener("touchend", this.handleTouchMove, {
      passive: true,
    });
    window.addEventListener("touchcancel", this.handleTouchCancel, {
      passive: true,
    });

    this.refModalImg.current?.addEventListener?.(
      "transitionend",
      this.handleZoomEnd,
      { once: true }
    );
  };

  /**
   * Report that the zoom modal is loaded and listen
   * for window resizing
   */
  handleZoomEnd = () => {
    setTimeout(() => {
      this.setState({ modalState: ModalState.LOADED });
      window.addEventListener("resize", this.handleResize, { passive: true });
    }, 0);
  };

  // ===========================================================================

  /**
   * Perform unzooming actions
   */
  unzoom = () => {
    this.setState({ modalState: ModalState.UNLOADING });

    window.removeEventListener("wheel", this.handleWheel);
    window.removeEventListener("touchstart", this.handleTouchStart);
    window.removeEventListener("touchend", this.handleTouchMove);
    window.removeEventListener("touchcancel", this.handleTouchCancel);

    this.refModalImg.current?.addEventListener?.(
      "transitionend",
      this.handleUnzoomEnd,
      { once: true }
    );
  };

  /**
   * Clean up the remaining things from zooming
   * and report that we're done unzooming
   */
  handleUnzoomEnd = () => {
    setTimeout(() => {
      window.removeEventListener("resize", this.handleResize);

      this.setState({
        shouldRefresh: false,
        modalState: ModalState.UNLOADED,
      });

      this.refDialog.current?.close?.();

      this.bodyScrollEnable();
    }, 0);
  };

  // ===========================================================================

  /**
   * Disable body scrolling
   */
  bodyScrollDisable = () => {
    this.prevBodyAttrs = {
      overflow: document.body.style.overflow,
      width: document.body.style.width,
    };

    // Get clientWidth before setting overflow: 'hidden'
    const clientWidth = document.body.clientWidth;

    document.body.style.overflow = "hidden";
    document.body.style.width = `${clientWidth}px`;
  };

  /**
   * Enable body scrolling
   */
  bodyScrollEnable = () => {
    document.body.style.width = this.prevBodyAttrs.width;
    document.body.style.overflow = this.prevBodyAttrs.overflow;
    this.prevBodyAttrs = defaultBodyAttrs;
  };

  // ===========================================================================

  /**
   * Load the zoomImg manually
   */
  loadZoomImg = () => {
    const {
      props: { zoomImg },
    } = this;
    const zoomImgSrc = zoomImg?.src;

    if (zoomImgSrc) {
      const img = new Image();
      img.sizes = zoomImg?.sizes ?? "";
      img.srcset = zoomImg?.srcSet ?? "";
      img.src = zoomImgSrc;

      const setLoaded = () => {
        this.setState({ isZoomImgLoaded: true });
      };

      img
        .decode()
        .then(setLoaded)
        .catch(() => {
          if (testImgLoaded(img)) {
            setLoaded();
            return;
          }
          img.onload = setLoaded;
        });
    }
  };

  // ===========================================================================

  /**
   * Hackily deal with SVGs because of all of their unknowns
   */
  UNSAFE_handleSvg = () => {
    const { imgEl, refModalImg, styleModalImg } = this;

    if (testSvg(imgEl)) {
      const tmp = document.createElement("div");
      tmp.innerHTML = imgEl.outerHTML;

      const svg = tmp.firstChild as SVGSVGElement;
      svg.style.width = `${styleModalImg.width || 0}px`;
      svg.style.height = `${styleModalImg.height || 0}px`;
      svg.addEventListener("click", this.handleUnzoom);

      refModalImg.current?.firstChild?.remove?.();
      refModalImg.current?.appendChild?.(svg);
    }
  };
}
