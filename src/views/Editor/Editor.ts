import { Component, Vue, Watch } from 'vue-property-decorator'

import Konva from 'konva'
import { KonvaEventObject } from 'konva/types/Node'
import { RectangleService } from './services/Rectangle'
import { Layer } from 'konva/types/Layer'
import { Stage } from 'konva/types/Stage'
import { EllipseService } from './services/Ellipse'
import { Vector2d } from 'konva/types/types'

enum Mode {
  Select = 0,
  DrawRectangle = 1,
  DrawEllipse = 2,
  DrawPolygon = 3
}

type Service = RectangleService | EllipseService

@Component
export default class Editor extends Vue {
  private stage?: Konva.Stage
  private layer?: Konva.Layer

  private isDrawing = false
  private transformer = new Konva.Transformer()
  private Services: Service[] = []

  public uploadImage = true
  public editorMode = Mode.Select

  public labelInput = ""
  private backgroundRatio?: number
  private backgroundKonva?: Konva.Image
  private backgroundImage?: HTMLImageElement
  public previewImage = {
    url: '',
    height: 0,
    width: 0
  }
  public labeledImage: any[] = []

  private isDrawingPolygon = false
  private lines: Konva.Line[] = []
  private points: Konva.Circle[] = []
  private groups: Konva.Group[] = []
  private isFinishPolygon = false

  get topService() {
    if (this.Services.length > 0) {
      return this.Services[this.Services.length - 1]
    } else {
      return null
    }
  }

  private initKonva() {
    this.stage = new Konva.Stage({
      container: 'konva-stage',
      width: 700,
      height: 700
    })
    this.layer = new Konva.Layer()
    this.layer.add(this.transformer)
  }

  public useTransformer(func: Function) {
    func(this.transformer)
    this.layer?.draw()
  }

  public useIsDrawingMode(func: Function) {
    func(this.isDrawingMode(this.editorMode))
  }

  private isDrawingMode(mode: number): boolean {
    return Mode.DrawRectangle <= mode && mode <= Mode.DrawEllipse
  }

  private isSelectionMode(mode: number): boolean {
    return mode === Mode.Select
  }

  private detachTransformer() {
    this.transformer.detach()
    this.layer?.draw()
  }

  private initEvent() {
    this.stage?.on('mousedown', (event: KonvaEventObject<MouseEvent>) => {
      if (this.isDrawingMode(this.editorMode)) {
        // remove the top service if its status is still READY
        if (this.topService?.status === 'READY') {
          this.topService.getInstance()?.destroy()
          this.layer?.draw()
        }

        this.isDrawing = true
        switch (this.editorMode) {
          case Mode.DrawRectangle:
            this.Services.push(new RectangleService({ useTranformer: this.useTransformer, useIsDrawingMode: this.useIsDrawingMode }))
            break
          case Mode.DrawEllipse:
            this.Services.push(new EllipseService({ useTranformer: this.useTransformer, useIsDrawingMode: this.useIsDrawingMode }))
            break
          default:
            break
        }
        this.topService?.onMouseDown(this.stage as Stage, this.layer as Layer, event)
      } else
        if (this.isSelectionMode(this.editorMode)) {
          if (event.target === this.stage) {
            this.detachTransformer()
          }
        }
    })
    this.stage?.on('mousemove', (event: KonvaEventObject<MouseEvent>) => {
      if (this.isDrawingMode(this.editorMode) && this.isDrawing) {
        this.topService?.onMouseMove(this.stage as Stage, this.layer as Layer, event)
      }
      if (this.editorMode === Mode.DrawPolygon && this.isDrawingPolygon) {
        const cursor = (this.stage as Stage).getPointerPosition() as Vector2d
        const line = this.lines[this.lines.length - 1] as Konva.Line
        if (line.zIndex() > 0) {
          this.points[0].zIndex(line.zIndex())
        }
        line.zIndex(0)
        const points = line.points()
        points[2] = cursor.x
        points[3] = cursor.y
        line.points(points)
        this.layer?.draw()
      }
    })
    this.stage?.on('mouseup', (event: KonvaEventObject<MouseEvent>) => {
      if (this.isDrawingMode(this.editorMode) && this.isDrawing) {
        this.isDrawing = false
        this.topService?.onMouseUp(this.stage as Stage, this.layer as Layer, event)
        if (this.topService?.isDestroyed) {
          this.Services.pop()
        } else
          if (this.topService instanceof RectangleService) {
            const instance = this.topService.getInstance()
            const ratio = this.backgroundRatio
            if (ratio && instance && instance.x() && instance.y() && instance.width() && instance.height()) {
              const [x, y] = this.getRelativePosition(instance.x(), instance.y())
              const w = instance.width() * ratio
              const h = instance.height() * ratio
              this.previewImage.url = this.cropImage(this.backgroundImage, x, y, w, h)
              this.previewImage.height = instance.height()
              this.previewImage.width = instance.width()
            }
          }
      }
    })
    this.stage?.on('click', (event: KonvaEventObject<MouseEvent>) => {
      if (this.editorMode === Mode.DrawPolygon) {
        const cursor = (this.stage as Stage).getPointerPosition() as Vector2d

        let isStartingPoint = false
        if (this.isDrawingPolygon) {
          const line = this.lines[this.lines.length - 1] as Konva.Line
          const points = line.points()
          points[2] = cursor.x
          points[3] = cursor.y
          line.points(points)
          this.layer?.draw()
        } else {
          if (!this.isFinishPolygon) {
            this.isDrawingPolygon = true
            isStartingPoint = true
            this.groups.push(new Konva.Group())
          }
        }

        if (this.isFinishPolygon) {
          this.isFinishPolygon = false;
        } else {
          const group = this.groups[this.groups.length - 1]
          const popts = { x: cursor.x, y: cursor.y, radius: 3, stroke: 'white', fill: '#1dfa11' }
          this.points.push(new Konva.Circle(popts))
          const point = this.points[this.points.length - 1]
          group.add(point)
          if (isStartingPoint) {
            point.hitStrokeWidth(12)
            point.on('mouseover', (event: KonvaEventObject<MouseEvent>) => {
              if (this.points.length >= 3) {
                point.scale({ x: 2, y: 2 })
              }
            })
            point.on('mouseout', (event: KonvaEventObject<MouseEvent>) => {
              point.scale({ x: 1, y: 1 })
            })
            point.on('click', (event: KonvaEventObject<MouseEvent>) => {
              if (this.points.length >= 3) {
                event.evt.preventDefault()
                this.isDrawingPolygon = false

                this.lines[this.lines.length - 1].destroy()
                const line = new Konva.Line({ points: [this.points[this.points.length - 1].x(), this.points[this.points.length - 1].y(), this.points[0].x(), this.points[0].y()], stroke: 'red', strokeWidth: 3 })
                group.add(line)
                this.lines.push(line)
                this.layer?.add(group)
                this.stage?.add(this.layer)

                this.points[0].setZIndex(line.zIndex())
                this.points[0].scale({ x: 1, y: 1 })
                this.layer?.draw()
                this.points = []

                this.isFinishPolygon = true
              }
            })
          }
          const line = new Konva.Line({ points: [cursor.x, cursor.y, cursor.x, cursor.y], stroke: 'red', strokeWidth: 3 })
          group.add(line)
          this.lines.push(line)
          this.layer?.add(group)
          this.stage?.add(this.layer)
          this.layer?.draw()
        }
      }
    })
  }

  public onUploadImage(event: any) {
    const URL = window.webkitURL || window.URL
    const url = URL.createObjectURL(event.target.files[0])
    const image = new Image()
    image.src = url

    image.onload = () => {
      const width = image.width
      const height = image.height

      const max = 700
      const ratio = (width > height ? width / max : height / max)

      const konvaImage = new Konva.Image({
        image: image,
        x: max / 2 - width / (2 * ratio),
        y: max / 2 - height / (2 * ratio),
        width: width / ratio,
        height: height / ratio
      })

      this.uploadImage = false
      this.init(() => {
        this.layer?.add(konvaImage)
        this.stage?.add(this.layer)
        this.layer?.draw()
        this.backgroundImage = image
        this.backgroundRatio = ratio
        this.backgroundKonva = konvaImage
      })
    }
  }

  private getRelativePosition(x: number, y: number): number[] {
    const ratio = this.backgroundRatio
    if (ratio !== undefined) {
      const xBackground = this.backgroundKonva?.x()
      const yBackground = this.backgroundKonva?.y()
      const wBackground = this.backgroundKonva?.width()
      const hBackground = this.backgroundKonva?.height()
      if ((xBackground !== undefined)
        && (yBackground !== undefined)
        && (wBackground !== undefined)
        && (hBackground !== undefined)) {
        if (x < xBackground) x = xBackground
        if (y < yBackground) y = yBackground
        if (x > xBackground + wBackground) x = xBackground + wBackground
        if (y > yBackground + hBackground) y = yBackground + hBackground
        return [(x - xBackground) * ratio, (y - yBackground) * ratio]
      }
    }
    return []
  }

  public cropImage(image: HTMLImageElement | undefined, x: number, y: number, width: number, height: number): string {
    const canvas: HTMLCanvasElement = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d')
    if (image !== undefined) {
      ctx?.drawImage(image, x, y, width, height, 0, 0, width, height)
      return canvas.toDataURL()
    }
    return ''
  }

  public addLabel(event: any) {
    event.preventDefault()

    // Set the top service status is DONE
    // if not, it could be deleted 
    if (this.topService?.status) {
      this.topService.status = 'DONE'
      this.topService.getInstance()?.stroke('green')
      this.layer?.draw()
    }

    const image = Object.assign({ label: this.labelInput }, this.previewImage)
    this.labeledImage.unshift(image)
    this.previewImage.url = ''
    this.labelInput = ''
  }

  @Watch('editorMode')
  onEditorModeChanged(value: number, oldValue: number) {
    if (this.isSelectionMode(value) && this.isDrawingMode(oldValue)) {
      // this.Services.forEach((service) => {
      //   service.resumeDraggable()
      // })
    } else
      if (this.isDrawingMode(value) && this.isSelectionMode(oldValue)) {
        this.detachTransformer()
        this.Services.forEach((service) => {
          service.stopDraggable()
        })
      }
  }

  private init(fn: Function) {
    this.$nextTick(() => {
      this.initKonva()
      this.initEvent()
      fn()
    })
  }
}
