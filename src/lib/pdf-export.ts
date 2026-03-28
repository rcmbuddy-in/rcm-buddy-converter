import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const TAB_TITLES: Record<string, string> = {
  overview: 'Overview Dashboard',
  financial: 'Financial KPIs',
  tat: 'TAT Analysis',
  denial: 'Denial Analysis',
  ar: 'AR Management',
  payer: 'Payer Performance',
  leakage: 'Revenue Leakage',
  'ai-report': 'AI Report',
};

export interface ExportCapture {
  tabId: string;
  canvas: HTMLCanvasElement;
}

const waitForPaint = async (delay = 450) => {
  await new Promise(resolve => setTimeout(resolve, delay));
  await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
  await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
};

const lockChartDimensions = (root: ParentNode) => {
  const sizedNodes = root.querySelectorAll<HTMLElement>('.recharts-responsive-container, .recharts-wrapper');
  sizedNodes.forEach(node => {
    const rect = node.getBoundingClientRect();
    if (rect.width > 0) node.style.width = `${Math.ceil(rect.width)}px`;
    if (rect.height > 0) node.style.height = `${Math.ceil(rect.height)}px`;
    node.style.maxWidth = 'none';
    node.style.overflow = 'visible';
  });

  const svgs = root.querySelectorAll<SVGSVGElement>('svg');
  svgs.forEach(svg => {
    const rect = svg.getBoundingClientRect();
    const width = Math.ceil(rect.width || Number(svg.getAttribute('width')) || 0);
    const height = Math.ceil(rect.height || Number(svg.getAttribute('height')) || 0);

    if (width > 0) svg.setAttribute('width', String(width));
    if (height > 0) svg.setAttribute('height', String(height));
    if (width > 0 && height > 0 && !svg.getAttribute('viewBox')) {
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }

    const svgEl = svg as unknown as HTMLElement;
    svgEl.style.width = width > 0 ? `${width}px` : svgEl.style.width;
    svgEl.style.height = height > 0 ? `${height}px` : svgEl.style.height;
    svgEl.style.overflow = 'visible';
  });
};

export async function captureDashboardCanvas() {
  const contentEl = document.getElementById('dashboard-tab-content');
  if (!contentEl) return null;

  const noPrintEls = contentEl.querySelectorAll<HTMLElement>('.no-print');
  const previousDisplays = Array.from(noPrintEls, el => el.style.display);

  lockChartDimensions(contentEl);
  noPrintEls.forEach(el => {
    el.style.display = 'none';
  });

  const originalContainers = Array.from(
    contentEl.querySelectorAll<HTMLElement>('.recharts-responsive-container, .recharts-wrapper')
  ).map(node => {
    const rect = node.getBoundingClientRect();
    return { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
  });

  const originalSvgs = Array.from(contentEl.querySelectorAll<SVGSVGElement>('svg')).map(node => {
    const rect = node.getBoundingClientRect();
    return { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
  });

  try {
    await waitForPaint();

    return await html2canvas(contentEl, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: Math.max(1440, Math.ceil(contentEl.scrollWidth)),
      windowHeight: Math.max(window.innerHeight, Math.ceil(contentEl.scrollHeight)),
      scrollY: -window.scrollY,
      scrollX: 0,
      allowTaint: true,
      onclone: (clonedDoc) => {
        const clonedEl = clonedDoc.getElementById('dashboard-tab-content');
        if (!clonedEl) return;

        clonedEl.style.overflow = 'visible';
        clonedEl.style.height = 'auto';
        clonedEl.style.maxWidth = 'none';
        clonedEl.style.width = `${Math.ceil(contentEl.getBoundingClientRect().width)}px`;

        clonedEl.querySelectorAll<HTMLElement>('.no-print').forEach(el => {
          el.style.display = 'none';
        });

        const clonedContainers = clonedEl.querySelectorAll<HTMLElement>('.recharts-responsive-container, .recharts-wrapper');
        clonedContainers.forEach((node, index) => {
          const original = originalContainers[index];
          if (!original) return;
          if (original.width > 0) node.style.width = `${original.width}px`;
          if (original.height > 0) node.style.height = `${original.height}px`;
          node.style.maxWidth = 'none';
          node.style.overflow = 'visible';
        });

        const clonedSvgs = clonedEl.querySelectorAll<SVGSVGElement>('svg');
        clonedSvgs.forEach((svg, index) => {
          const original = originalSvgs[index];
          if (!original) return;
          if (original.width > 0) svg.setAttribute('width', String(original.width));
          if (original.height > 0) svg.setAttribute('height', String(original.height));
          if (original.width > 0 && original.height > 0) {
            svg.setAttribute('viewBox', `0 0 ${original.width} ${original.height}`);
          }
          const svgEl = svg as unknown as HTMLElement;
          svgEl.style.width = original.width > 0 ? `${original.width}px` : svgEl.style.width;
          svgEl.style.height = original.height > 0 ? `${original.height}px` : svgEl.style.height;
          svgEl.style.overflow = 'visible';
        });
      },
    });
  } finally {
    noPrintEls.forEach((el, index) => {
      el.style.display = previousDisplays[index];
    });
  }
}

const addPageHeader = (
  pdf: jsPDF,
  title: string,
  hospitalName: string,
  dateRange: string,
  sectionIndex: number,
  sectionCount: number,
  pageIndex: number
) => {
  const pageW = pdf.internal.pageSize.getWidth();
  const margin = 10;
  const headerH = 18;

  pdf.setFillColor(180, 30, 30);
  pdf.rect(0, 0, pageW, headerH + margin, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`RCM Buddy — ${title}`, margin, margin + 6);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');

  const meta = pageIndex === 0
    ? `${hospitalName} · ${dateRange} · Section ${sectionIndex + 1} of ${sectionCount}`
    : `${hospitalName} · ${dateRange} · Continued`;

  pdf.text(meta, margin, margin + 12);
};

const addPageFooter = (pdf: jsPDF) => {
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  pdf.setTextColor(150, 150, 150);
  pdf.setFontSize(7);
  pdf.text(
    `Generated by RCM Buddy · ${new Date().toLocaleDateString('en-IN')}`,
    margin,
    pageH - 5
  );
};

const appendCanvasToPdf = (
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  tabId: string,
  hospitalName: string,
  dateRange: string,
  sectionIndex: number,
  sectionCount: number,
  startOnNewPage: boolean
) => {
  const imgW = canvas.width;
  const imgH = canvas.height;
  if (imgH < 10) return;

  const title = TAB_TITLES[tabId] || tabId;
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const headerH = 18;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2 - headerH;
  const startY = headerH + margin + 2;
  const scale = usableW / (imgW / 2);
  const scaledH = (imgH / 2) * scale;
  const imgData = canvas.toDataURL('image/jpeg', 0.95);

  if (scaledH <= usableH) {
    if (startOnNewPage) pdf.addPage();
    addPageHeader(pdf, title, hospitalName, dateRange, sectionIndex, sectionCount, 0);
    pdf.addImage(imgData, 'JPEG', margin, startY, usableW, scaledH);
    addPageFooter(pdf);
    return;
  }

  const pxPerPage = Math.floor((usableH / scale) * 2);
  let srcY = 0;
  let pageIndex = 0;

  while (srcY < imgH) {
    if (startOnNewPage || pageIndex > 0) pdf.addPage();
    addPageHeader(pdf, title, hospitalName, dateRange, sectionIndex, sectionCount, pageIndex);

    const sliceH = Math.min(pxPerPage, imgH - srcY);
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = imgW;
    sliceCanvas.height = sliceH;
    const ctx = sliceCanvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(canvas, 0, srcY, imgW, sliceH, 0, 0, imgW, sliceH);

    const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.95);
    const sliceScaledH = (sliceH / 2) * scale;
    pdf.addImage(sliceData, 'JPEG', margin, startY, usableW, sliceScaledH);
    addPageFooter(pdf);

    srcY += pxPerPage;
    pageIndex++;
    startOnNewPage = true;
  }
};

export async function exportTabsToPDF(
  captures: ExportCapture[],
  hospitalName: string,
  dateRange: string
) {
  if (captures.length === 0) return;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  captures.forEach((capture, index) => {
    appendCanvasToPdf(
      pdf,
      capture.canvas,
      capture.tabId,
      hospitalName,
      dateRange,
      index,
      captures.length,
      index > 0
    );
  });

  pdf.save(`RCM_Buddy_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function exportTabToPDF(
  tabId: string,
  hospitalName: string,
  dateRange: string
) {
  const canvas = await captureDashboardCanvas();
  if (!canvas) return;

  await exportTabsToPDF([{ tabId, canvas }], hospitalName, dateRange);
}
