import { generateUUID } from 'three/src/math/MathUtils'
import MeshBatch from './MeshBatch'
import { SpeckleType } from '../converter/GeometryConverter'
import { WorldTree } from '../tree/WorldTree'
import LineBatch from './LineBatch'
import Materials from '../materials/Materials'
import SpeckleLineMaterial from '../materials/SpeckleLineMaterial'
import { NodeRenderView } from '../tree/NodeRenderView'
import { Batch, BatchUpdateRange, GeometryType } from './Batch'
import PointBatch from './PointBatch'
import { FilterMaterial } from '../FilteringManager'

export default class Batcher {
  private materials: Materials
  public batches: { [id: string]: Batch } = {}

  public constructor() {
    this.materials = new Materials()
    this.materials.createDefaultMaterials()
  }

  public makeBatches(batchType: GeometryType, ...speckleType: SpeckleType[]) {
    const rendeViews = WorldTree.getRenderTree()
      .getAtomicRenderViews(...speckleType)
      .sort((a, b) => {
        if (a.renderMaterialHash === 0) return -1
        if (b.renderMaterialHash === 0) return 1
        return a.renderMaterialHash - b.renderMaterialHash
      })
    const materialHashes = [
      ...Array.from(new Set(rendeViews.map((value) => value.renderMaterialHash)))
    ]

    console.warn(materialHashes)
    console.warn(rendeViews)

    for (let i = 0; i < materialHashes.length; i++) {
      const batch = rendeViews.filter(
        (value) => value.renderMaterialHash === materialHashes[i]
      )

      let matRef = null

      if (batchType === GeometryType.MESH) {
        matRef = batch[0].renderData.renderMaterial
      } else if (batchType === GeometryType.LINE) {
        matRef = batch[0].renderData.displayStyle
      }

      const material = this.materials.updateMaterialMap(
        materialHashes[i],
        matRef,
        batchType
      )

      const batchID = generateUUID()
      switch (batchType) {
        case GeometryType.MESH:
          this.batches[batchID] = new MeshBatch(batchID, batch)
          break
        case GeometryType.LINE:
          this.batches[batchID] = new LineBatch(batchID, batch)
          break
        case GeometryType.POINT:
          this.batches[batchID] = new PointBatch(batchID, batch)
          break
        case GeometryType.POINT_CLOUD:
          this.batches[batchID] = new PointBatch(batchID, batch)
          break
      }

      this.batches[batchID].setBatchMaterial(material as SpeckleLineMaterial)
      this.batches[batchID].buildBatch()
      console.warn(batch)
    }
  }

  public getRenderView(batchId: string, index: number) {
    return this.batches[batchId].getRenderView(index)
  }

  public resetBatchesDrawRanges() {
    for (const k in this.batches) {
      this.batches[k].resetDrawRanges()
    }
  }

  public setObjectsFilterMaterial(ids: string[], filterMaterial: FilterMaterial) {
    this.resetBatchesDrawRanges()

    let rvs = []
    ids.forEach((val: string) => {
      const views = WorldTree.getRenderTree().getRenderViewsForNodeId(val)
      for (let k = 0; k < views.length; k++) {
        if (rvs.includes(views[k])) return
      }
      rvs = rvs.concat(WorldTree.getRenderTree().getRenderViewsForNodeId(val))
    })
    // console.log(ids)
    // console.log(rvs)
    const batchIds = [...Array.from(new Set(rvs.map((value) => value.batchId)))]
    for (let i = 0; i < batchIds.length; i++) {
      const batch = this.batches[batchIds[i]]
      const views = rvs
        .filter((value) => value.batchId === batchIds[i])
        .map((rv: NodeRenderView) => {
          return {
            offset: rv.batchStart,
            count: rv.batchCount,
            material: this.materials.getFilterMaterial(rv, filterMaterial)
          } as BatchUpdateRange
        })
      batch.setDrawRanges(true, ...views)
    }
  }

  /** KEEPING THESE FOR REFERENCE FOR NOW */
  /*
  public selectRenderViews(renderViews: NodeRenderView[]) {
    this.resetBatchesDrawRanges()
    const batchIds = [...Array.from(new Set(renderViews.map((value) => value.batchId)))]
    console.warn('<<<< BATCHES >>>>>>')
    for (let i = 0; i < batchIds.length; i++) {
      const batch = this.batches[batchIds[i]]
      const views = renderViews
        .filter((value) => value.batchId === batchIds[i])
        .map((rv: NodeRenderView) => {
          return {
            offset: rv.batchStart,
            count: rv.batchCount,
            material: this.materials.getHighlightMaterial(rv)
          }
        })
      // console.warn(views)
      batch.setDrawRanges(true, ...views)
    }
  }

  public selectRenderView(renderView: NodeRenderView) {
    this.resetBatchesDrawRanges()
    const batch = this.batches[renderView.batchId]
    batch.setDrawRanges(
      false,
      {
        offset: 0,
        count: renderView.batchStart,
        material: batch.batchMaterial
      } as BatchUpdateRange,
      {
        offset: renderView.batchStart,
        count: renderView.batchCount,
        material: this.materials.getHighlightMaterial(renderView)
      } as BatchUpdateRange,
      {
        offset: renderView.batchEnd,
        count: Infinity,
        material: batch.batchMaterial
      } as BatchUpdateRange
    )
  }

  public isolateRenderView(renderView: NodeRenderView) {
    this.resetBatchesDrawRanges()

    for (const k in this.batches) {
      if (k === renderView.batchId) {
        const batch = this.batches[renderView.batchId]
        batch.setVisibleRange({
          offset: renderView.batchStart,
          count: renderView.batchCount,
          material: batch.batchMaterial
        } as BatchUpdateRange)
        batch.setDrawRanges(false, {
          offset: renderView.batchStart,
          count: renderView.batchCount,
          material: batch.batchMaterial
        } as BatchUpdateRange)
      } else {
        this.batches[k].setVisibleRange(HideAllBatchUpdateRange)
      }
    }
  }

  public isolateRenderViews(renderViews: NodeRenderView[]) {
    this.resetBatchesDrawRanges()
    const batchIds = [...Array.from(new Set(renderViews.map((value) => value.batchId)))]
    // console.warn('<<<< BATCHES >>>>>>')
    for (const k in this.batches) {
      if (!batchIds.includes(k)) {
        this.batches[k].setVisibleRange(HideAllBatchUpdateRange)
      }
    }
    for (let i = 0; i < batchIds.length; i++) {
      const batch = this.batches[batchIds[i]]
      const views = renderViews
        .filter((value) => value.batchId === batchIds[i])
        .map((rv: NodeRenderView) => {
          return {
            offset: rv.batchStart,
            count: rv.batchCount,
            material: batch.batchMaterial
          }
        })
      // console.warn(views)
      batch.setDrawRanges(false, ...views)
      batch.setVisibleRange(...views)
    }
  }
  */
}