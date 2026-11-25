<!-- [TINIX] Preview and assign the pieces before importing any layer. -->
<template>
  <el-dialog :model-value="open" :title="t(prefix + 'title')" width="min(900px, 94vw)" append-to-body
    :show-close="!busy" :close-on-press-escape="!busy" :close-on-click-modal="!busy" :before-close="requestClose"
    @update:model-value="closeDialog">
    <fieldset class="material-files" :disabled="busy" :aria-busy="guessingFiles">
      <!-- [TINIX] One-pass import of the four material PNGs and their layout. -->
      <label>{{ t(prefix + 'materialArchive') }}
        <input class="material-archive" type="file" accept=".zip,application/zip" @change="loadArchive" />
      </label>
      <label>{{ t(prefix + 'folder') }} <input type="file" webkitdirectory multiple @change="loadFolder" /></label>
      <label v-for="kind in kinds" :key="kind">
        {{ t(prefix + (kind === 'diagram' ? 'diagramFile' : kind)) }}
        <select v-if="folderFiles.length" :value="files[kind] ? folderFileKey(files[kind]) : ''" @change="chooseFolderFile(kind, $event)">
          <option value="">{{ t(prefix + 'choose') }}</option>
          <option v-for="file in folderFiles" :key="folderFileKey(file)" :value="folderFileKey(file)">{{ folderFileKey(file) }}</option>
        </select>
        <input v-else type="file" :accept="kind === 'sheet' ? 'image/png' : 'image/png,image/jpeg,image/webp'" @change="chooseFile(kind, $event)" />
        <span v-if="!folderFiles.length && files[kind]" class="material-file-name">{{ files[kind]?.name }}</span>
      </label>
    </fieldset>
    <!-- [TINIX] Keep ZIP diagnostics visible before any layer is applied. -->
    <section v-if="archiveCheck" class="material-archive-check">
      <strong>{{ t(prefix + 'archiveCheckTitle') }}</strong>
      <!-- [TINIX] Copy the complete report, including regions beyond the selected warning. -->
      <div class="material-archive-copy">
        <button type="button" class="material-archive-copy-button" :disabled="busy" @click="copyArchiveReport">
          {{ t(prefix + 'archiveCopyReport') }}
        </button>
        <span v-if="archiveCopyState" role="status">{{ t(prefix + archiveCopyState) }}</span>
      </div>
      <textarea v-if="archiveCopyState === 'archiveCopyManual'" ref="archiveCopyText" class="material-archive-copy-text"
        :aria-label="t(prefix + 'archiveCopyReport')" :value="archiveReportText" readonly rows="6" />
      <div v-if="archiveCheck.count !== undefined" role="status">
        {{ archiveCheckSummary }}
      </div>
      <div v-if="archiveCheck.alpha.length || archiveCheck.source.length || archiveCheck.unlisted.length || archiveCheck.fields.length"
        class="material-archive-review">
        <ul>
          <li v-if="archiveCheck.alpha.length" class="material-archive-alpha">
            {{ t(prefix + 'archiveCheckAlpha') }}
            <div class="material-archive-warnings">
              <button v-for="item in archiveCheck.alpha" :key="item.id" type="button"
                :aria-pressed="archiveRegion === item" @click="archiveRegion = item">{{ item.id }}</button>
            </div>
          </li>
          <li v-if="archiveCheck.source.length" class="material-archive-source">
            {{ t(prefix + 'archiveCheckSource') }}
            <div class="material-archive-warnings">
              <button v-for="item in archiveCheck.source" :key="item.id" type="button"
                :aria-pressed="archiveRegion === item" @click="archiveRegion = item">{{ item.id }} ({{ item.overlap }}%)</button>
            </div>
          </li>
          <li v-if="archiveCheck.unlisted.length" class="material-archive-unlisted">
            {{ t(prefix + 'archiveCheckUnlisted') }}
            <div class="material-archive-warnings">
              <button v-for="item in archiveCheck.unlisted" :key="item.id" type="button"
                :aria-pressed="archiveRegion === item" @click="archiveRegion = item">
                {{ item.id }}<span v-if="archiveDuplicates[item.id]"> · {{ archiveDuplicates[item.id] }}</span>
              </button>
            </div>
            <!-- [TINIX] Classify unlisted PNG regions without modifying the source or the draft. -->
            <div class="material-archive-classification" role="status">
              {{ t(prefix + 'archiveClassificationCounts', { duplicate: archiveUnlisted.duplicates.length, needsCode: archiveUnlisted.needsCode.length }) }}
            </div>
            <label v-if="selectedUnlisted && archiveFrameCodes.length" class="material-archive-classify">
              {{ selectedUnlisted.id }}
              <select :value="archiveDuplicates[selectedUnlisted.id] ?? ''"
                :aria-label="t(prefix + 'archiveClassifyRegion', { id: selectedUnlisted.id })"
                @change="classifyArchiveRegion(selectedUnlisted.id, ($event.target as HTMLSelectElement).value)">
                <option value="">{{ t(prefix + 'archiveNeedsCode') }}</option>
                <option v-for="code in archiveFrameCodes" :key="code" :value="code">
                  {{ t(prefix + 'archiveDuplicateFrame', { code }) }}
                </option>
              </select>
            </label>
            <div v-if="selectedUnlisted && archiveDuplicateWorker && !archiveDuplicates[selectedUnlisted.id]"
              class="material-archive-classification">
              <button v-if="archiveSuggestedFrame" type="button" class="material-archive-confirm-duplicate"
                @click="classifyArchiveRegion(selectedUnlisted.id, archiveSuggestedFrame)">
                {{ t(prefix + 'archiveConfirmSuggestedFrame', { code: archiveSuggestedFrame }) }}
              </button>
              <span v-else role="status" class="material-archive-duplicate-status"
                :data-ready="archiveDuplicateResults.has(selectedUnlisted.id)">
                {{ t(prefix + (archiveDuplicateResults.has(selectedUnlisted.id) ? 'archiveNoDuplicateSuggestion' : 'archiveMatchingDuplicate')) }}
              </span>
            </div>
          </li>
          <li v-for="gap in archiveCheck.fields" :key="gap.code" class="material-archive-fields">
            <button v-if="gap.bounds" type="button" :aria-pressed="archiveRegion?.bounds === gap.bounds"
              @click="archiveRegion = { id: gap.code, bounds: gap.bounds }">
              {{ t(prefix + 'archiveCheckFields', { code: gap.code, fields: gap.fields.join(', ') }) }}
            </button>
            <template v-else>{{ t(prefix + 'archiveCheckFields', { code: gap.code, fields: gap.fields.join(', ') }) }}</template>
          </li>
        </ul>
        <div v-if="archiveSheet" class="material-archive-sheet">
          <svg class="material-archive-sheet-art" :viewBox="`0 0 ${archiveSheet.width} ${archiveSheet.height}`"
            :width="archiveSheet.width" :height="archiveSheet.height" role="img"
            :aria-label="t(prefix + 'archiveSheetPreview')" @pointermove="readArchivePoint" @pointerleave="archivePoint = undefined">
            <image :href="archiveSheet.url" :width="archiveSheet.width" :height="archiveSheet.height" />
            <template v-if="archiveRegion">
              <path class="material-archive-shade" :d="archiveShade" fill-rule="evenodd" />
              <rect class="material-archive-highlight" :data-piece="archiveRegion.id"
                :x="archiveRegion.bounds.left" :y="archiveRegion.bounds.top"
                :width="archiveRegion.bounds.right - archiveRegion.bounds.left"
                :height="archiveRegion.bounds.bottom - archiveRegion.bounds.top" vector-effect="non-scaling-stroke" />
            </template>
          </svg>
          <div class="material-archive-coordinates">{{ archivePoint ? t(prefix + 'archiveSheetCoordinates', archivePoint) :
            t(prefix + 'archiveSheetSize', archiveSheet) }}</div>
        </div>
      </div>
      <button v-if="verifiedArchive" type="button" class="material-archive-apply" :disabled="busy" @click="applyVerifiedArchive">
        {{ t(prefix + 'apply') }}
      </button>
    </section>
    <template v-if="source">
      <div class="material-actions">
        <!-- [TINIX] Suggestions are optional and calculated from the original source pixels. -->
        <button type="button" class="material-suggest" :disabled="busy || !files.reference || !preview.length" @click="suggestAll">{{ t(prefix + 'suggest') }}</button>
        <button v-if="files.diagram" type="button" class="material-suggest-diagram"
          :disabled="busy || !files.reference || !preview.some(piece => piece.role === 'frame')"
          @click="() => suggest(undefined, true)">{{ t(prefix + 'suggestDiagram') }}</button>
        <!-- [TINIX] Coordinates are shown for review before import. -->
        <button v-if="layoutFile" type="button" class="material-suggest-layout"
          :disabled="busy || guessingFiles || !files.reference || !preview.some(piece => piece.role === 'frame')"
          @click="suggestLayout">{{ t(prefix + 'suggestLayout') }}</button>
        <span v-if="layoutResult" role="status">
          {{ t(prefix + (layoutResult.decorations ? 'layoutPiecesResult' : 'layoutResult'), layoutResult) }}
        </span>
        <!-- [TINIX] Review matched silhouettes on the original reference before approving. -->
        <button v-if="layoutReviewIds.length" type="button" class="material-frame-outline-toggle"
          :aria-pressed="showFrameOutlines" :disabled="busy" @click="showFrameOutlines = !showFrameOutlines">
          {{ t(prefix + 'frameOutlineOverlay') }}
        </button>
        <button v-if="layoutApprovalIds.length" type="button" class="material-accept-layout"
          :disabled="busy || layoutApprovalIds.every(id => accepted.includes(id) || flaggedFrames.has(id))"
          @click="acceptLayout">{{ t(prefix + (layoutApprovalIds.length > layoutReviewIds.length ? 'acceptLayoutPieces' : 'acceptLayout')) }}</button>
        <!-- [TINIX] Filter the cards without changing the pieces or their approval state. -->
        <label v-if="frameFilter !== 'all' || preview.some(piece => piece.role === 'frame')">
          <input class="material-pending-frames" type="checkbox" :checked="frameFilter === 'pending'" :disabled="busy"
            @change="frameFilter = frameFilter === 'pending' ? 'all' : 'pending'" />
          {{ t(prefix + 'onlyPendingFrames') }}
        </label>
        <!-- [TINIX] Counts cover all frames, independently of the active card filter. -->
        <template v-if="frameFilter !== 'all' || preview.some(piece => piece.role === 'frame')">
          <button type="button" class="material-filter-unpositioned" :aria-pressed="frameFilter === 'unpositioned'" :disabled="busy"
            @click="frameFilter = frameFilter === 'unpositioned' ? 'all' : 'unpositioned'">
            {{ t(prefix + 'frameUnpositionedCount', { n: frameStatusCounts.unpositioned }) }}
          </button>
          <button type="button" class="material-filter-awaiting" :aria-pressed="frameFilter === 'awaiting'" :disabled="busy"
            @click="frameFilter = frameFilter === 'awaiting' ? 'all' : 'awaiting'">
            {{ t(prefix + 'frameAwaitingCount', { n: frameStatusCounts.awaiting }) }}
          </button>
        </template>
        <label>{{ t(prefix + 'alpha') }} <input v-model.number="threshold" type="number" min="4" max="254" :disabled="busy" @change="rescan" /></label>
        <!-- [TINIX] Optional cleanup uses a copy of the loaded source. -->
        <label :title="t(prefix + 'alphaCleanupHint')">
          <input v-model="cleanAlpha" type="checkbox" class="material-alpha-cleanup" :disabled="busy" @change="rescan" />
          {{ t(prefix + 'alphaCleanup') }}
        </label>
        <span v-if="cleanAlpha && filteredSource" role="status">{{ t(prefix + 'alphaCleaned', { n: filteredSource.removed }) }}</span>
        <span role="status">{{ t(prefix + 'count', { n: preview.length }) }}</span>
        <button type="button" :disabled="busy || selected.length < 2" @click="merge">{{ t(prefix + 'merge') }}</button>
        <template v-if="selected.length === 1">
          <label>{{ t(prefix + 'position') }} <input v-model.number="splitAt" type="range" min="5" max="95" /> {{ splitAt }}%</label>
          <button type="button" :disabled="busy" @click="split('x')">{{ t(prefix + 'splitX') }}</button>
          <button type="button" :disabled="busy" @click="split('y')">{{ t(prefix + 'splitY') }}</button>
        </template>
      </div>
      <div v-if="searchPiece" class="material-search-actions">
        <span role="status">{{ t(prefix + (adjustLoadedTarget && activeTargetPose ? 'seededTargetHint' : searchHint),
          { n: preview.findIndex(piece => piece.id === searchPiece) + 1 }) }}</span>
        <!-- [TINIX] The target is a placement, separate from the region used by the matcher. -->
        <label v-if="targetMode" class="material-target-bleed">
          <input v-model="targetBleed" type="checkbox" :disabled="busy" @change="cancelArea" />
          {{ t(prefix + 'allowTargetBleed') }}
        </label>
        <button v-if="targetMode && poses.get(searchPiece)?.target" type="button" class="material-clear-target" :disabled="busy"
          @click="clearTarget">{{ t(prefix + 'clearTarget') }}</button>
        <!-- [TINIX] Restore the previous placement and review state. -->
        <button v-if="targetMode" type="button" class="material-undo-target" :disabled="busy || !targetUndo"
          @click="undoTargetEdit">{{ t(prefix + 'undoTargetEdit') }}</button>
        <template v-if="!targetMode">
          <button v-if="searchAreas.has(searchPiece)" type="button" :disabled="busy" @click="clearArea">{{ t(prefix + 'clearArea') }}</button>
          <!-- [TINIX] Direction is relative to the source piece's horizontal axis. -->
          <button v-if="searchAreas.has(searchPiece)" type="button" class="material-direction" :aria-pressed="drawingDirection"
            :disabled="busy" @click="toggleSearchMode('direction')">{{ t(prefix + 'direction') }}</button>
          <button v-if="searchAreas.get(searchPiece)?.angle !== undefined" type="button" :disabled="busy" @click="clearDirection">
            {{ t(prefix + 'clearDirection') }}
          </button>
          <!-- [TINIX] A pinned centre is independent of the region and direction. -->
          <button type="button" class="material-center" :aria-pressed="searchMode === 'center'" :disabled="busy"
            @click="toggleSearchMode('center')">{{ t(prefix + 'pinCenter') }}</button>
          <button v-if="searchCenters.has(searchPiece)" type="button" :disabled="busy" @click="clearCenter">{{ t(prefix + 'clearCenter') }}</button>
        </template>
        <button type="button" :disabled="busy" @click="endSearch">{{ t(prefix + 'finishArea') }}</button>
      </div>
      <!-- [TINIX] Adjust the selected target while looking at its live overlay. -->
      <div v-if="activeTargetPose" class="material-target-controls">
        <label>{{ t(prefix + 'targetAngle') }}
          <input class="material-target-angle" type="number" min="-180" max="180" step="1"
            :value="activeTargetPose.angle" :disabled="busy" @input="changeTargetAngle" @change="commitTargetAngle" />
        </label>
        <label>{{ t(prefix + 'targetFit') }}
          <select class="material-target-fit" :value="activeTargetPose.targetFit ?? 'contain'" :disabled="busy" @change="changeTargetFit">
            <option value="contain">{{ t(prefix + 'targetFitContain') }}</option>
            <option value="width">{{ t(prefix + 'targetFitWidth') }}</option>
            <option value="height">{{ t(prefix + 'targetFitHeight') }}</option>
          </select>
        </label>
      </div>
      <div v-if="suggestionGuide && poses.size" class="material-layer-actions">
        <!-- [TINIX] The preview and canvas share the same back-to-front order. -->
        <button type="button" class="material-layer-mode" :aria-pressed="layerMode" :disabled="busy" @click="toggleLayerMode">
          {{ t(prefix + 'layerOrder') }}
        </button>
        <template v-if="layerMode">
          <label>{{ t(prefix + 'movingPiece') }}
            <select v-model.number="movingPiece" class="material-layer-moving">
              <option :value="0">{{ t(prefix + 'choosePiece') }}</option>
              <option v-for="(piece, index) in preview" :key="piece.id" :value="piece.id">{{ t(prefix + 'piece', { n: index + 1 }) }}</option>
            </select>
          </label>
          <label>{{ t(prefix + 'anchorPiece') }}
            <select v-model.number="anchorPiece" class="material-layer-anchor">
              <option :value="0">{{ t(prefix + 'choosePiece') }}</option>
              <option v-for="(piece, index) in preview" :key="piece.id" :value="piece.id" :disabled="movingPiece === piece.id">
                {{ t(prefix + 'piece', { n: index + 1 }) }}
              </option>
            </select>
          </label>
          <button type="button" class="material-layer-below" :disabled="!canMoveLayer" @click="moveLayer(false)">{{ t(prefix + 'layerBelow') }}</button>
          <button type="button" class="material-layer-above" :disabled="!canMoveLayer" @click="moveLayer(true)">{{ t(prefix + 'layerAbove') }}</button>
          <button type="button" :disabled="!moves.length || busy" @click="resetLayerOrder">{{ t(prefix + 'resetLayerOrder') }}</button>
          <!-- [TINIX] Check the selected text before suggesting any layer moves. -->
          <button type="button" class="material-ink-check" :disabled="!canCheckInk" @click="checkObstructions('ink')">{{ t(prefix + 'checkInk') }}</button>
          <button type="button" class="material-piece-check" :disabled="!canCheckPiece" @click="checkObstructions('piece')">{{ t(prefix + 'checkPiece') }}</button>
          <!-- [TINIX] Compare the visible pixels at the overlap with the reference. -->
          <button type="button" class="material-reference-stack" :disabled="!canCheckPiece" @click="checkWholeReference">{{ t(prefix + 'checkReferenceStack') }}</button>
          <!-- [TINIX] Inspect only the junction of the two chosen pieces. -->
          <button type="button" class="material-junction" :aria-pressed="drawingJunction"
            :disabled="!canCheckJunction" @click="toggleJunction">{{ t(prefix + 'checkJunction') }}</button>
          <span v-if="drawingJunction" role="status">{{ t(prefix + 'junctionHint') }}</span>
        </template>
      </div>
      <div v-if="layerMode && referenceStack" class="material-layer-actions" aria-live="polite">
        <!-- [TINIX] Show the extra area considered after an inconclusive first scan. -->
        <span v-if="expandedJunction" class="material-junction-expanded" :data-step="expandedJunction.step">{{ t(prefix + 'expandedJunction') }}</span>
        <span v-if="!referenceStack.length">{{ t(prefix + 'noReferenceStack') }}</span>
        <template v-for="item in referenceStack" :key="item.id">
          <button v-if="needsStackMove(item)" type="button" class="material-reference-suggestion" :data-piece-id="item.id"
            :data-above="item.above" :disabled="busy" @click="applyStackMove(item)">{{ stackLabel(item) }}</button>
          <span v-else class="material-reference-confirmed" :data-piece-id="item.id" :data-above="item.above">{{ stackLabel(item) }}</span>
        </template>
      </div>
      <div v-if="layerMode && inkSuggestions" class="material-layer-actions" aria-live="polite">
        <span v-if="!inkSuggestions.items.length">{{ t(prefix + (inkSuggestions.mode === 'ink' ? 'noInkObstruction' : 'noPieceObstruction')) }}</span>
        <button v-for="item in inkSuggestions.items" :key="item.id" type="button" class="material-ink-suggestion" :data-piece-id="item.id"
          :disabled="busy" @click="sendBackingBelow(item.id)">
          {{ t(prefix + (inkSuggestions.mode === 'ink' ? 'sendBackingBelow' : 'sendPieceBelow'),
            { n: preview.findIndex(piece => piece.id === item.id) + 1, percent: item.percent }) }}
        </button>
      </div>
      <svg v-if="suggestionGuide && (poses.size || targetMode)" ref="mapSurface" class="material-map"
        :class="{ 'material-drawing': searchPiece || drawingJunction, 'material-map-bleed': mapPadding > 0 || frameOutlines.length }"
        :viewBox="`${-mapPadding} ${-mapPadding} ${suggestionGuide.width + mapPadding * 2} ${suggestionGuide.height + mapPadding * 2}`"
        :aria-label="t(prefix + 'map')"
        @pointerdown="startArea" @pointermove="moveArea" @pointerup="finishArea" @pointercancel="cancelArea" @lostpointercapture="cancelArea">
        <rect v-if="mapPadding" class="material-bleed-area" :x="-mapPadding" :y="-mapPadding"
          :width="suggestionGuide.width + mapPadding * 2" :height="suggestionGuide.height + mapPadding * 2" />
        <image :href="(!frameOutlines.length && searchMode !== 'edge' && diagramPreview) || suggestionGuide.image"
          :width="suggestionGuide.width" :height="suggestionGuide.height" />
        <rect v-if="mapPadding" class="material-reference-edge" :width="suggestionGuide.width" :height="suggestionGuide.height" />
        <g v-if="layerMode && !drawingJunction" class="material-layer-preview" pointer-events="none">
          <image v-for="item in layerPreview" :key="item.piece.id" :data-piece-id="item.piece.id" :href="item.piece.url"
            :x="-item.width / 2" :y="-item.height / 2" :width="item.width" :height="item.height"
            preserveAspectRatio="none"
            :transform="poseTransform(item.piece.id) + ' rotate(' + item.angle + ')'" />
        </g>
        <g v-for="item in frameOutlines" :key="item.piece.id" class="material-frame-outline"
          :class="{ 'material-frame-flagged': flaggedFrames.has(item.piece.id) }"
          :transform="poseTransform(item.piece.id) + ' rotate(' + item.angle + ') translate(' + (-item.width / 2) + ' ' + (-item.height / 2) + ')'"
          pointer-events="none" aria-hidden="true">
          <path class="material-frame-outline-halo" :d="item.path" vector-effect="non-scaling-stroke" />
          <path :d="item.path" vector-effect="non-scaling-stroke" />
        </g>
        <image v-if="targetPreview && (!pendingArea || adjustLoadedTarget) && !frameOutlines.length" class="material-target-preview"
          :href="targetPreview.piece.url"
          :x="-targetPreview.width / 2" :y="-targetPreview.height / 2" :width="targetPreview.width" :height="targetPreview.height"
          preserveAspectRatio="none"
          :transform="`translate(${targetPreview.pose.x * suggestionGuide.width} ${targetPreview.pose.y * suggestionGuide.height}) rotate(${targetPreview.angle})`" />
        <g v-for="(piece, index) in preview" v-show="!drawingJunction" :key="piece.id">
          <g v-if="poses.get(piece.id)" :transform="poseTransform(piece.id)"
            :class="[accepted.includes(piece.id) ? 'pose-accepted' : 'pose-review',
              { 'pose-highlight': highlighted === piece.id || movingPiece === piece.id, 'pose-selectable': layerMode }]"
            :role="layerMode ? 'button' : undefined" :tabindex="layerMode ? 0 : undefined" :aria-label="t(prefix + 'piece', { n: index + 1 })"
            @click="selectLayerMarker(piece.id)" @keydown.enter.prevent="selectLayerMarker(piece.id)" @keydown.space.prevent="selectLayerMarker(piece.id)">
            <circle r="13" />
            <text text-anchor="middle" dominant-baseline="central">{{ index + 1 }}</text>
          </g>
        </g>
        <!-- [TINIX] The region limits the centre search for only the selected piece. -->
        <rect v-if="visibleArea" class="material-search-box" :x="visibleArea.x * suggestionGuide.width" :y="visibleArea.y * suggestionGuide.height"
          :width="visibleArea.width * suggestionGuide.width" :height="visibleArea.height * suggestionGuide.height" />
        <rect v-if="visibleTarget" class="material-target-box" :x="visibleTarget.x * suggestionGuide.width" :y="visibleTarget.y * suggestionGuide.height"
          :width="visibleTarget.width * suggestionGuide.width" :height="visibleTarget.height * suggestionGuide.height" />
        <!-- [TINIX] Corner handles resize around the opposite corner. -->
        <template v-if="adjustLoadedTarget && targetMode && visibleTarget">
          <circle v-for="corner in targetCorners" :key="corner.name" class="material-target-handle"
            :data-target-corner="corner.name" :style="{ cursor: corner.cursor }" :r="suggestionGuide.width * .018"
            :cx="(visibleTarget.x + visibleTarget.width * corner.x) * suggestionGuide.width"
            :cy="(visibleTarget.y + visibleTarget.height * corner.y) * suggestionGuide.height" />
        </template>
        <rect v-if="expandedJunction && junctionArea" class="material-junction-original" :x="junctionArea.x * suggestionGuide.width"
          :y="junctionArea.y * suggestionGuide.height" :width="junctionArea.width * suggestionGuide.width" :height="junctionArea.height * suggestionGuide.height" />
        <path v-if="directionTransform" class="material-direction-arrow" :transform="directionTransform"
          d="M -48 0 H 48 M 28 -18 L 48 0 L 28 18" />
        <g v-if="visibleCenter" class="material-center-pin"
          :transform="`translate(${visibleCenter.x * suggestionGuide.width} ${visibleCenter.y * suggestionGuide.height})`">
          <circle r="24" />
          <path d="M -29 0 H 29 M 0 -29 V 29" />
        </g>
        <!-- [TINIX] Display the saved bottom point on the diagram during review. -->
        <circle v-for="{ id, point } in archBottomMarkers" :key="'bottom-' + id" class="material-bottom-pin"
          :cx="point.x * suggestionGuide.width" :cy="point.y * suggestionGuide.height" r="14" />
        <!-- [TINIX] Show the chosen segment on the reference photo. -->
        <line v-if="visibleMeasuredEdge" class="material-measured-edge"
          :x1="visibleMeasuredEdge.start.x * suggestionGuide.width" :y1="visibleMeasuredEdge.start.y * suggestionGuide.height"
          :x2="visibleMeasuredEdge.end.x * suggestionGuide.width" :y2="visibleMeasuredEdge.end.y * suggestionGuide.height" />
      </svg>
      <div v-if="openingPiece" ref="openingPanel">
        <MaterialOpeningEditor :key="openingPiece.id" :source="openingPiece.url" :width="openingPiece.width" :height="openingPiece.height"
          :opening="openingPiece.opening" :disabled="busy" @change="useOpening" @close="openingId = 0" />
      </div>
      <p v-if="frameFilter !== 'all' && !visibleCards.length" role="status">
        {{ t(prefix + (frameFilter === 'pending' ? 'noPendingFrames' : 'emptyFrameGroup')) }}
      </p>
      <div v-else class="material-grid" :inert="busy">
        <div v-for="{ piece, index: i } in visibleCards" :key="piece.id" :data-piece-id="piece.id" @pointerenter="highlighted = piece.id" @pointerleave="highlighted = 0"
          @focusin="highlighted = piece.id" @focusout="highlighted = 0">
          <label>
            <input v-model="selected" type="checkbox" :value="piece.id" />
            {{ t(prefix + 'piece', { n: i + 1 }) }}
          </label>
          <img :src="piece.url" alt="" />
          <!-- [TINIX] Distinguish unpositioned frames from positions awaiting review. -->
          <span v-if="piece.role === 'frame' && !accepted.includes(piece.id)" class="material-frame-status">
            {{ t(prefix + (poses.has(piece.id) ? 'frameAwaitingReview' : 'frameUnpositioned')) }}
          </span>
          <!-- [TINIX] Scan results with changed geometry need a separate review. -->
          <span v-if="reviewPieces.has(piece.id)" class="material-rescan-review">{{ t(prefix + 'rescanReview') }}</span>
          <select v-model="piece.role" :aria-label="t(prefix + 'piece', { n: i + 1 })">
            <option value="sticker">{{ t(prefix + 'sticker') }}</option>
            <option value="frame">{{ t(prefix + 'frame') }}</option>
            <option value="hero" :disabled="preview.some(other => other.id !== piece.id && other.role === 'hero')">{{ t(prefix + 'hero') }}</option>
          </select>
          <label v-if="(files.diagram || layoutFile || piece.frameCode) && piece.role === 'frame'">
            {{ t(prefix + 'frameCode') }}
            <select class="material-frame-code" :value="piece.frameCode || ''" @change="changeFrameCode(piece, $event)">
              <option value="">{{ t(prefix + 'frameCodeUnset') }}</option>
              <option v-for="code in diagramFrameCodes" :key="code" :value="code"
                :disabled="preview.some(other => other.id !== piece.id && other.role === 'frame' && other.frameCode === code)">{{ code }}</option>
            </select>
          </label>
          <button v-if="piece.role === 'frame'" type="button" class="material-opening" :aria-pressed="openingId === piece.id"
            @click="() => editOpening(piece.id)">{{ t(prefix + (piece.automaticOpening ? 'editDetectedOpening' : piece.opening ? 'editOpening' : 'traceOpening')) }}</button>
          <button v-if="diagramPreview && piece.role === 'frame' && piece.frameCode && piece.opening && isArchedOpening(piece.opening)"
            type="button" class="material-arch-bottom" :aria-pressed="searchMode === 'bottom' && searchPiece === piece.id"
            @click="chooseSearch(piece.id, 'bottom')">{{ t(prefix + 'archBottom') }}</button>
          <button v-if="canMeasureEdge(piece)" type="button" class="material-measure-edge"
            :aria-pressed="searchMode === 'edge' && searchPiece === piece.id"
            @click="chooseSearch(piece.id, 'edge')">{{ t(prefix + 'measureEdge') }}</button>
          <label v-if="poses.get(piece.id)" class="material-pose">
            <input v-model="accepted" type="checkbox" :value="piece.id" :disabled="flaggedFrames.has(piece.id)" />
            {{ poseLabel(piece.id) }}
          </label>
          <label v-if="layoutReviewIds.includes(piece.id) && (showFrameOutlines || flaggedFrames.has(piece.id))">
            <input class="material-frame-flag" type="checkbox" :checked="flaggedFrames.has(piece.id)" @change="toggleFrameFlag(piece.id)" />
            {{ t(prefix + 'flagFramePlacement') }}
          </label>
          <button v-if="suggestionGuide && poses.size && !poses.get(piece.id)?.target" type="button" class="material-search"
            :aria-pressed="searchPiece === piece.id && !targetMode"
            @click="chooseSearch(piece.id)">{{ t(prefix + (searchAreas.has(piece.id) ? 'editArea' : 'searchArea')) }}</button>
          <!-- [TINIX] Flagged cards open the same target tool directly. -->
          <button v-if="files.reference" type="button" class="material-target" :aria-pressed="searchPiece === piece.id && targetMode"
            @click="() => chooseTarget(piece.id)">
            {{ t(prefix + (flaggedFrames.has(piece.id) ? 'alignFlaggedFrame' : poses.get(piece.id)?.target ? 'editTarget' : 'drawTarget')) }}
          </button>
        </div>
      </div>
      <button v-if="!verifiedArchive" type="button" class="material-import" :disabled="busy || !ready || !preview.length || !!archiveCheck?.fields.length" @click="() => apply()">{{ t(prefix + 'apply') }}</button>
    </template>
    <!-- [TINIX] Persist only draft metadata until the user imports the pieces. -->
    <button v-if="kinds.some(kind => files[kind])" type="button" class="material-save-session" :disabled="busy" @click="saveWhileOpen">
      {{ t(prefix + 'saveSession') }}
    </button>
    <span v-if="sessionSaved" role="status">{{ t(prefix + 'sessionSaved') }}</span>
    <span v-if="busy" role="status">{{ t(prefix + 'working') }}</span>
    <span v-if="error" role="alert">{{ t(prefix + error) }}</span>
    <button v-if="error === 'sessionSaveError' && !busy" type="button" @click="emit('close')">{{ t(prefix + 'closeWithoutSession') }}</button>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MaterialOpeningEditor from '@/components/business/ai-assistant/MaterialOpeningEditor.vue'
import { filterDetachedAlpha, matchRescannedPieces, materialPixels, pieceBounds, pieceImage, pieceOpeningPath, previewMaterialPiece, sheetPieces, suggestSheetThreshold, type PieceRole, type SheetPiece, type PieceOpening } from '@/utils/tinix/material-sheet'
import { loadReferenceGuide, type CanvasReferenceGuide } from '@/utils/tinix/reference-guide'
import { cutoutCanvas, readCutoutFile, readCutoutImage } from '@/utils/tinix/cutout-workspace'
import { fitMaterialEdge, materialPoseScale, type MatchRequest, type MaterialDiagramArea, type MaterialEdge, type MaterialPose, type MaterialSearchArea, type MaterialSearchCenter, type MaterialTargetFit } from '@/utils/tinix/material-placement'
import { findMaterialObstructions, inferInterruptedEdge, inferMaterialStack } from '@/utils/tinix/material-ink-coverage'
import { decodeMaterialScan, encodeMaterialPixels, restoreMaterialFile, type MaterialScanState, type MaterialSession } from '@/utils/tinix/material-session'
import { suggestMaterialFolder } from '@/utils/tinix/material-folder' // [TINIX]
import { createDiagramCodeReader, diagramFrameCodes, diagramSearchAreas, hasRoundDiagramOpening } from '@/utils/tinix/material-diagram' // [TINIX]
import { isArchedOpening, openingFitKind, outerPaperContour } from '@/utils/tinix/material-opening-fit' // [TINIX]
import { isMaterialPrintSize, matchMaterialLayout, parseMaterialLayout, type MaterialPrintSize, type MaterialSubject } from '@/utils/tinix/material-layout' // [TINIX]
import { openMaterialArchive } from '@/utils/tinix/material-archive' // [TINIX]
import { checkMaterialArchive, hasMaterialArchiveWarnings, type ArchiveRegion, type MaterialArchiveCheck } from '@/utils/tinix/material-archive-check' // [TINIX]
import type { DuplicatePatternRequest, DuplicatePatternResult } from '@/utils/tinix/material-duplicate-pattern.worker' // [TINIX]

const props = defineProps<{ open: boolean; session?: MaterialSession; persistSession: (session: MaterialSession) => Promise<boolean> }>()
type MaterialPiece = ReturnType<typeof pieceImage> & { role: PieceRole; pose?: MaterialPose; cutOuterOnly?: boolean; index: number } // [TINIX]
const emit = defineEmits<{ close: []; apply: [payload: { guide: CanvasReferenceGuide; background: string; width: number; height: number;
  pieces: MaterialPiece[]; subjectZ?: number; subject?: MaterialSubject; printSize?: MaterialPrintSize; archive?: boolean }] }>()
const { t } = useI18n()
const prefix = 'tinix.ui.materialSheet.'
const required = ['reference', 'background', 'sheet'] as const
const kinds = [...required, 'diagram'] as const
type Kind = typeof kinds[number]
const files = reactive<Partial<Record<Kind, File>>>({})
const sessionSaved = ref(false)
const fileData = new WeakMap<File, string>()
let restoring = false
const originalReferenceWidth = ref<number>()
const folderFiles = shallowRef<File[]>([])
const layoutFile = shallowRef<File>()
const layoutResult = shallowRef<{ matched: number; total: number; decorations: number }>()
const subjectZ = ref<number>()
const subject = shallowRef<MaterialSubject>()
const printSize = shallowRef<MaterialPrintSize>()
const archiveImport = ref(false) // [TINIX] Show the import report for this ZIP.
const archiveCheck = shallowRef<Omit<MaterialArchiveCheck, 'count'> & { count?: number }>()
const verifiedArchive = shallowRef<{ guide: CanvasReferenceGuide; background: string }>()
// [TINIX] Keep the highlight in original sheet pixels, independent of the preview size.
const archiveSheet = shallowRef<{ url: string; width: number; height: number }>()
const archiveRegion = shallowRef<ArchiveRegion>()
const archivePoint = shallowRef<{ x: number; y: number }>()
// [TINIX] Decisions apply to this report only. An unmarked region still needs a code.
const archiveFrameCodes = shallowRef<string[]>([])
const archiveDuplicates = ref<Record<string, string>>({})
const selectedUnlisted = computed(() => archiveCheck.value?.unlisted.find(item => item === archiveRegion.value))
// [TINIX] Check only regions opened for review and keep their results while this ZIP is open.
const archiveDuplicateWorker = shallowRef<Worker>()
const archiveDuplicateResults = ref(new Map<string, string | undefined>())
const requestedDuplicateRegions = new Set<string>()
const archiveSuggestedFrame = computed(() => {
  const id = selectedUnlisted.value?.id
  return id ? archiveDuplicateResults.value.get(id) : undefined
})
watch(selectedUnlisted, region => {
  const matcher = archiveDuplicateWorker.value
  if (!region || !matcher || requestedDuplicateRegions.has(region.id)) return
  requestedDuplicateRegions.add(region.id)
  matcher.postMessage({ region } satisfies DuplicatePatternRequest)
})
const archiveUnlisted = computed(() => {
  const regions = archiveCheck.value?.unlisted ?? []
  return {
    duplicates: regions.filter(item => archiveDuplicates.value[item.id]),
    needsCode: regions.filter(item => !archiveDuplicates.value[item.id]),
  }
})
// [TINIX] Include the archive basename and original PNG boxes in clipboard text.
const archiveName = ref('')
const archiveCopyState = ref<'archiveCopyDone' | 'archiveCopyManual'>()
const archiveCopyText = ref<HTMLTextAreaElement>()
const archiveCheckSummary = computed(() => {
  const check = archiveCheck.value
  if (check?.count === undefined) return ''
  return t(prefix + 'archiveCheckCounts', { total: check.count, alpha: check.alpha.length,
    source: check.source.length, unlisted: check.unlisted.length })
})
const archiveReportText = computed(() => {
  const check = archiveCheck.value
  if (!check) return ''
  const lines = [t(prefix + 'archiveReportHeading', { name: archiveName.value }),
    t(prefix + 'archiveReportCoordinates'), archiveCheckSummary.value].filter(Boolean)
  if (archiveSheet.value) lines.push(t(prefix + 'archiveSheetSize', archiveSheet.value))
  function addGroup(key: string, entries: string[]) {
    if (entries.length) lines.push('', t(prefix + key), ...entries.map(entry => '- ' + entry))
  }
  addGroup('archiveCheckAlpha', check.alpha.map(item => archiveReportRegion(item.id, item.bounds)))
  addGroup('archiveReportSource', check.source.map(item => archiveReportRegion(`${item.id} (${item.overlap}%)`, item.bounds)))
  addGroup('archiveReportDuplicateRegions', archiveUnlisted.value.duplicates.map(item =>
    archiveReportRegion(`${item.id} · ${t(prefix + 'archiveDuplicateFrame', { code: archiveDuplicates.value[item.id] })}`, item.bounds)))
  addGroup('archiveReportNeedsCode', archiveUnlisted.value.needsCode.map(item => archiveReportRegion(item.id, item.bounds)))
  addGroup('archiveReportMissingFields', check.fields.map(gap => archiveReportRegion(
    t(prefix + 'archiveCheckFields', { code: gap.code, fields: gap.fields.join(', ') }), gap.bounds)))
  return lines.join('\n')
})
const archiveShade = computed(() => {
  const sheet = archiveSheet.value
  const bounds = archiveRegion.value?.bounds
  if (!sheet || !bounds) return ''
  const { left, top, right, bottom } = bounds
  return `M0 0H${sheet.width}V${sheet.height}H0Z M${left} ${top}H${right}V${bottom}H${left}Z`
})
const guessingFiles = ref(false)
const folderFileKey = (file: File) => folderFiles.value.filter(other => other.name === file.name).length > 1
  ? file.webkitRelativePath || file.name : file.name
const ready = computed(() => required.every(kind => files[kind]) && new Set(required.map(kind => files[kind])).size === required.length)
const originalSource = shallowRef<ImageData>()
const cleanAlpha = ref(false)
const filteredSource = computed(() => cleanAlpha.value && originalSource.value ? filterDetachedAlpha(originalSource.value) : undefined)
const source = computed(() => filteredSource.value?.image ?? originalSource.value)
const threshold = ref(8)
const busy = ref(false)
const error = ref('')
const splitAt = ref(50)
const selected = ref<number[]>([])
const preview = ref<Array<SheetPiece & { id: number; url: string; role: PieceRole; width: number; height: number;
  opening?: PieceOpening; automaticOpening?: boolean; frameCode?: string }>>([])
// [TINIX] Openings belong to a stable material piece, not to its placement on the page.
const openingId = ref(0)
const openingPanel = ref<HTMLElement>()
const openingPiece = computed(() => preview.value.find(piece => piece.id === openingId.value && piece.role === 'frame'))
const reviewPieces = shallowRef(new Set<number>())
const poses = shallowRef(new Map<number, MaterialPose>())
const accepted = ref<number[]>([])
const frameStatusCounts = computed(() => {
  let unpositioned = 0
  let awaiting = 0
  for (const piece of preview.value) {
    if (piece.role !== 'frame') continue
    if (!poses.value.has(piece.id)) unpositioned++
    else if (!accepted.value.includes(piece.id)) awaiting++
  }
  return { unpositioned, awaiting }
})
const frameFilter = ref<'all' | 'pending' | 'unpositioned' | 'awaiting'>('all')
const visibleCards = computed(() => preview.value.map((piece, index) => ({ piece, index })).filter(({ piece }) => {
  if (frameFilter.value === 'all') return true
  if (piece.role !== 'frame') return false
  const status = !poses.value.has(piece.id) ? 'unpositioned' : accepted.value.includes(piece.id) ? 'approved' : 'awaiting'
  return frameFilter.value === 'pending' ? status !== 'approved' : status === frameFilter.value
}))
// [TINIX] Batch approval applies only to positions supplied by layout.json.
const layoutReviewIds = computed(() => preview.value.filter(piece => {
  const pose = poses.value.get(piece.id)
  return piece.role === 'frame' && pose?.fromLayout && !pose.measuredEdge
}).map(piece => piece.id))
const layoutApprovalIds = computed(() => [
  ...layoutReviewIds.value,
  ...preview.value.filter(piece => piece.role === 'sticker' && poses.value.get(piece.id)?.decorationCode).map(piece => piece.id),
])
const showFrameOutlines = ref(false)
const flaggedFrames = reactive(new Set<number>())
watch(layoutReviewIds, ids => {
  for (const id of flaggedFrames) if (!ids.includes(id)) flaggedFrames.delete(id)
})
function toggleFrameFlag(id: number) {
  if (flaggedFrames.delete(id)) return
  flaggedFrames.add(id)
  accepted.value = accepted.value.filter(value => value !== id)
}
function acceptLayout() {
  accepted.value = [...new Set([...accepted.value, ...layoutApprovalIds.value.filter(id => !flaggedFrames.has(id))])]
}
const highlighted = ref(0)
watch(visibleCards, cards => {
  if (highlighted.value && !cards.some(({ piece }) => piece.id === highlighted.value)) highlighted.value = 0
})
const layerMode = ref(false)
const movingPiece = ref(0)
const anchorPiece = ref(0)
const moves = ref<Array<{ piece: number; anchor: number; above: boolean }>>([])
// [TINIX] Keep recent scan states in the open dialog for this sheet/reference pair.
type ScanEdits = {
  pieces: typeof preview.value
  review: Set<number>
  poses: Map<number, MaterialPose>
  accepted: number[]
  areas: Map<number, MaterialSearchArea>
  centers: Map<number, MaterialSearchCenter>
  moves: typeof moves.value
}
const scanEdits = new Map<string, ScanEdits>()
let scanKey: string | undefined
const inkSuggestions = ref<{ mode: 'ink' | 'piece'; items: Awaited<ReturnType<typeof findMaterialObstructions>> }>()
type StackSuggestion = Awaited<ReturnType<typeof inferMaterialStack>>[number]
const referenceStack = ref<StackSuggestion[]>()
const drawingJunction = ref(false)
const frameContours = computed(() => {
  const image = source.value
  if (!showFrameOutlines.value || !image) return []
  return preview.value.filter(piece => layoutReviewIds.value.includes(piece.id)).map(piece => ({
    piece, outer: outerPaperContour(piece, image, pieceBounds(piece, image.width), piece),
  }))
})
const junctionArea = shallowRef<MaterialSearchArea>()
const expandedJunction = shallowRef<{ region: MaterialSearchArea; step: number }>()
const canMoveLayer = computed(() => !busy.value && movingPiece.value > 0 && anchorPiece.value > 0 && movingPiece.value !== anchorPiece.value)
const layerRoles = { frame: 1, hero: 2, sticker: 3 }
const layerOrder = computed(() => {
  const positioned = (id: number) => Number(accepted.value.includes(id) && poses.value.has(id))
  const z = (id: number) => positioned(id) ? poses.value.get(id)?.layoutOrder ?? -1 : -1
  const order = preview.value.map((piece, index) => ({ piece, index }))
    .sort((a, b) => positioned(a.piece.id) - positioned(b.piece.id) || z(a.piece.id) - z(b.piece.id) ||
      layerRoles[a.piece.role] - layerRoles[b.piece.role])
  for (const move of moves.value) {
    const from = order.findIndex(item => item.piece.id === move.piece)
    if (from < 0 || !order.some(item => item.piece.id === move.anchor)) continue
    const [item] = order.splice(from, 1)
    const to = order.findIndex(entry => entry.piece.id === move.anchor)
    order.splice(to + Number(move.above), 0, item)
  }
  return order
})
function placedPiece(piece: typeof preview.value[number], pose: MaterialPose) {
  const guide = suggestionGuide.value
  if (!guide) return
  const scale = materialPoseScale(pose, piece, guide, originalReferenceWidth.value)
  return { piece, angle: pose.angle, width: piece.width * scale, height: piece.height * scale * (pose.heightRatio ?? 1) }
}
const layerPreview = computed(() => {
  return layerOrder.value.flatMap(({ piece }) => {
    const pose = poses.value.get(piece.id)
    const placement = pose && accepted.value.includes(piece.id) && placedPiece(piece, pose)
    return placement ? [placement] : []
  })
})
const checkTarget = computed(() => layerPreview.value.find(({ piece }) => piece.id === movingPiece.value))
const canCheckPiece = computed(() => !busy.value && Boolean(checkTarget.value))
const canCheckInk = computed(() => canCheckPiece.value && checkTarget.value?.piece.role === 'sticker')
const junctionAnchor = computed(() => layerPreview.value.find(({ piece }) => piece.id === anchorPiece.value))
const canCheckJunction = computed(() => canMoveLayer.value && Boolean(checkTarget.value && junctionAnchor.value))
const suggestionGuide = shallowRef<CanvasReferenceGuide>()
const diagramPreview = ref('')
watch(() => files.diagram, () => { diagramPreview.value = '' })
const mapSurface = ref<SVGSVGElement>()
const searchAreas = reactive(new Map<number, MaterialSearchArea>())
const searchCenters = reactive(new Map<number, MaterialSearchCenter>())
const searchPiece = ref(0)
const frameOutlines = computed(() => {
  if (searchPiece.value || layerMode.value) return []
  return frameContours.value.flatMap(({ piece, outer }) => {
    const pose = poses.value.get(piece.id)
    const item = pose && placedPiece(piece, pose)
    if (!item) return []
    const path = [outer, piece.opening].map(points => pieceOpeningPath(points ?? [], item.width, item.height)).join(' ')
    return path ? [{ ...item, path }] : []
  })
})
const pendingArea = shallowRef<MaterialSearchArea>()
const searchMode = ref<'area' | 'direction' | 'center' | 'target' | 'bottom' | 'edge'>('area')
const pendingEdge = shallowRef<MaterialEdge>()
const visibleMeasuredEdge = computed(() => searchMode.value === 'edge'
  ? pendingEdge.value ?? poses.value.get(searchPiece.value)?.measuredEdge : undefined)
const drawingDirection = computed(() => searchMode.value === 'direction')
const targetMode = computed(() => searchMode.value === 'target')
const targetBleed = ref(false)
const adjustLoadedTarget = ref(false)
const targetUndo = shallowRef<{ pose?: MaterialPose; approved: boolean; flagged: boolean }>()
let editingTargetAngle = false
const targetCorners = [
  { name: 'nw', x: 0, y: 0, cursor: 'nwse-resize' }, { name: 'ne', x: 1, y: 0, cursor: 'nesw-resize' },
  { name: 'sw', x: 0, y: 1, cursor: 'nesw-resize' }, { name: 'se', x: 1, y: 1, cursor: 'nwse-resize' },
]
// [TINIX] Keep reference coordinates fixed while giving the pointer room outside the page.
const mapPadding = computed(() => targetMode.value && targetBleed.value && suggestionGuide.value
  ? Math.round(Math.min(suggestionGuide.value.width, suggestionGuide.value.height) / 4) : 0)
const searchHint = computed(() => ({ area: 'searchHint', direction: 'directionHint', center: 'centerHint', target: 'targetHint',
  bottom: 'archBottomHint', edge: 'measureEdgeHint' })[searchMode.value])
const pendingDirection = ref<number>()
const visibleArea = computed(() => targetMode.value ? undefined : pendingArea.value ??
  (layerMode.value ? expandedJunction.value?.region ?? junctionArea.value : searchAreas.get(searchPiece.value || highlighted.value)))
const visibleCenter = computed(() => targetMode.value ? undefined : searchCenters.get(searchPiece.value || highlighted.value))
const archBottomMarkers = computed(() => diagramPreview.value ? [...poses.value].flatMap(([id, pose]) =>
  pose.archBottom ? [{ id, point: pose.archBottom }] : []) : [])
// [TINIX] Seed the editor from the placed PNG without writing anything until the user edits it.
const seededTarget = computed(() => {
  const id = searchPiece.value
  const pose = poses.value.get(id)
  const guide = suggestionGuide.value
  const piece = preview.value.find(item => item.id === id)
  if (!targetMode.value || !flaggedFrames.has(id) || !pose || pose.target || !guide || !piece) return
  const placement = placedPiece(piece, pose)
  if (!placement) return
  const radians = pose.angle * Math.PI / 180
  const cos = Math.abs(Math.cos(radians))
  const sin = Math.abs(Math.sin(radians))
  const width = (placement.width * cos + placement.height * sin) / guide.width
  const height = (placement.width * sin + placement.height * cos) / guide.height
  return { ...pose, fromLayout: undefined, measuredEdge: undefined,
    target: { x: pose.x - width / 2, y: pose.y - height / 2, width, height } }
})
const activeTargetPose = computed(() => {
  const pose = poses.value.get(searchPiece.value)
  return targetMode.value && pose?.target ? pose : seededTarget.value
})
const visibleTarget = computed(() => targetMode.value
  ? pendingArea.value ?? activeTargetPose.value?.target
  : !drawingJunction.value && !searchPiece.value ? poses.value.get(movingPiece.value || highlighted.value)?.target : undefined)
const targetPreview = computed(() => {
  const piece = preview.value.find(item => item.id === (searchPiece.value || highlighted.value))
  const measured = searchMode.value === 'edge' && !pendingEdge.value ? poses.value.get(searchPiece.value) : undefined
  const hovered = !searchPiece.value && !layerMode.value ? poses.value.get(highlighted.value) : undefined
  const pose = activeTargetPose.value ?? (measured?.measuredEdge ? measured : undefined) ?? (hovered?.fromLayout ? hovered : undefined)
  if (!piece || !pose) return
  const box = adjustLoadedTarget.value ? pendingArea.value : undefined
  const previewPose = box ? { ...pose, target: box, x: box.x + box.width / 2, y: box.y + box.height / 2 } : pose
  const placement = placedPiece(piece, previewPose)
  return placement && { ...placement, pose: previewPose }
})
const directionTransform = computed(() => {
  const box = visibleArea.value
  const guide = suggestionGuide.value
  const angle = pendingDirection.value ?? box?.angle
  if (!box || !guide || angle === undefined) return ''
  const point = visibleCenter.value ?? { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  return `translate(${point.x * guide.width} ${point.y * guide.height}) rotate(${angle})`
})
let gesture: { pointer: number; piece: number; x: number; y: number; direction: boolean; junction: boolean;
  moveTarget?: MaterialSearchArea; corner?: typeof targetCorners[number] } | undefined
let referencePixels: Pick<MatchRequest, 'reference' | 'originalWidth'> | undefined
let worker: Worker | undefined
let nextId = 1

onBeforeUnmount(() => worker?.terminate())
onBeforeUnmount(resetArchiveCheck)
onMounted(() => { if (props.session) void loadSession(props.session) })
function resetPlacement() {
  archiveImport.value = false
  printSize.value = undefined
  subject.value = undefined
  subjectZ.value = undefined
  showFrameOutlines.value = false
  flaggedFrames.clear()
  frameFilter.value = 'all'
  layoutResult.value = undefined
  poses.value = new Map()
  accepted.value = []
  searchAreas.clear()
  searchCenters.clear()
  resetLayerOrder()
  layerMode.value = false
  endSearch()
}
watch(() => files.reference, () => {
  if (restoring) return
  referencePixels = undefined
  originalReferenceWidth.value = undefined
  suggestionGuide.value = undefined
  resetPlacement()
  scanEdits.clear()
})
// [TINIX] A report and its prepared images belong to the selected ZIP only.
watch(() => kinds.map(kind => files[kind]), () => {
  if (restoring) return
  resetArchiveCheck()
})
watch(() => [files.reference, files.background, files.sheet, files.diagram, threshold.value, cleanAlpha.value,
  preview.value.map(piece => [piece.id, piece.role, piece.opening, piece.frameCode]), poses.value, [...accepted.value], [...moves.value]], () => {
  sessionSaved.value = false
})
watch([layerPreview, movingPiece], () => {
  inkSuggestions.value = undefined
  referenceStack.value = undefined
  expandedJunction.value = undefined
})
watch([movingPiece, anchorPiece], () => {
  cancelArea()
  drawingJunction.value = false
  junctionArea.value = undefined
  expandedJunction.value = undefined
  referenceStack.value = undefined
})

function chooseSearch(id: number, mode: 'area' | 'target' | 'bottom' | 'edge' = 'area') {
  targetUndo.value = undefined
  editingTargetAngle = false
  adjustLoadedTarget.value = mode === 'target' && (flaggedFrames.has(id) || Boolean(poses.value.get(id)?.target))
  openingId.value = 0
  layerMode.value = false
  drawingJunction.value = false
  cancelArea()
  searchMode.value = mode
  searchPiece.value = id
  void nextTick(() => mapSurface.value?.scrollIntoView({ block: 'nearest' }))
}

function canMeasureEdge(piece: typeof preview.value[number]) {
  const pose = poses.value.get(piece.id)
  if (piece.role !== 'frame' || !piece.opening || !pose || pose.target || !originalReferenceWidth.value) return false
  const kind = openingFitKind(piece.opening)
  return kind === 'polaroid' || kind === 'stamp'
}

async function chooseTarget(id: number) {
  const reference = files.reference
  if (busy.value || !reference) return
  if (!suggestionGuide.value) {
    busy.value = true
    error.value = ''
    try {
      suggestionGuide.value = await loadReferenceGuide(reference)
    } catch {
      error.value = 'suggestError'
      return
    } finally {
      busy.value = false
    }
  }
  chooseSearch(id, 'target')
  const box = activeTargetPose.value?.target
  if (box && (box.x < 0 || box.y < 0 || box.x + box.width > 1 || box.y + box.height > 1)) targetBleed.value = true
}

function toggleLayerMode() {
  endSearch()
  drawingJunction.value = false
  layerMode.value = !layerMode.value
}

function selectLayerMarker(id: number) {
  if (!layerMode.value || busy.value) return
  movingPiece.value = id
  if (anchorPiece.value === id) anchorPiece.value = 0
}

function moveLayer(above: boolean) {
  if (!canMoveLayer.value) return
  moves.value.push({ piece: movingPiece.value, anchor: anchorPiece.value, above })
}

async function checkObstructions(mode: 'ink' | 'piece') {
  const guide = suggestionGuide.value
  if (!guide || !(mode === 'ink' ? canCheckInk.value : canCheckPiece.value)) return
  const placed = layerPreview.value
  const target = movingPiece.value
  const index = placed.findIndex(item => item.piece.id === target)
  const position = ({ piece, width, height, angle }: typeof placed[number]) => {
    const pose = poses.value.get(piece.id)!
    return { id: piece.id, url: piece.url, width, height, angle, x: pose.x * guide.width, y: pose.y * guide.height }
  }
  busy.value = true
  inkSuggestions.value = undefined
  referenceStack.value = undefined
  error.value = ''
  try {
    const foreground = placed.slice(index + 1).filter(({ piece }) => mode === 'piece' || piece.role === 'sticker')
    const items = await findMaterialObstructions(guide.width, guide.height, position(placed[index]), foreground.map(position), mode)
    if (layerPreview.value === placed && movingPiece.value === target) inkSuggestions.value = { mode, items }
  } catch {
    error.value = 'suggestError'
  } finally {
    busy.value = false
  }
}

function toggleJunction() {
  cancelArea()
  junctionArea.value = undefined
  expandedJunction.value = undefined
  drawingJunction.value = !drawingJunction.value
}

function checkWholeReference() {
  cancelArea()
  drawingJunction.value = false
  junctionArea.value = undefined
  void checkReferenceStack()
}

async function checkReferenceStack(region?: MaterialSearchArea) {
  const guide = suggestionGuide.value
  if (!guide || !canCheckPiece.value) return
  const selected = movingPiece.value
  const anchor = junctionAnchor.value
  const placed = layerPreview.value
  const position = ({ piece, width, height, angle }: typeof placed[number]) => {
    const pose = poses.value.get(piece.id)!
    return { id: piece.id, url: piece.url, width, height, angle, x: pose.x * guide.width, y: pose.y * guide.height }
  }
  const target = position(checkTarget.value!)
  const neighbors = placed.filter(({ piece }) => piece.id !== selected).map(position)
  busy.value = true
  referenceStack.value = undefined
  expandedJunction.value = undefined
  inkSuggestions.value = undefined
  error.value = ''
  try {
    if (region && anchor) {
      const result = await inferInterruptedEdge(guide.width, guide.height, guide.image, target, position(anchor), region)
      if (layerPreview.value !== placed || movingPiece.value !== selected || junctionAnchor.value !== anchor) return
      referenceStack.value = result.items
      if (result.step) expandedJunction.value = { region: result.region, step: result.step }
    } else {
      const result = await inferMaterialStack(guide.width, guide.height, guide.image, target, neighbors)
      if (layerPreview.value === placed && movingPiece.value === selected) referenceStack.value = result
    }
  } catch {
    error.value = 'suggestError'
  } finally {
    busy.value = false
  }
}

function needsStackMove(item: StackSuggestion) {
  const order = layerOrder.value
  return (order.findIndex(({ piece }) => piece.id === item.id) >
    order.findIndex(({ piece }) => piece.id === movingPiece.value)) !== item.above
}

function stackLabel(item: StackSuggestion) {
  const key = item.above ? 'referenceAbove' : 'referenceBelow'
  return t(prefix + key, { n: preview.value.findIndex(piece => piece.id === item.id) + 1 })
}

function applyStackMove(item: StackSuggestion) {
  if (!busy.value && movingPiece.value) moves.value.push({ piece: item.id, anchor: movingPiece.value, above: item.above })
}

function sendBackingBelow(id: number) {
  const [bottom] = layerOrder.value
  if (!bottom || bottom.piece.id === id || busy.value) return
  moves.value.push({ piece: id, anchor: bottom.piece.id, above: false })
}

function resetLayerOrder() {
  moves.value = []
  movingPiece.value = 0
  anchorPiece.value = 0
}

function toggleSearchMode(mode: 'direction' | 'center') {
  cancelArea()
  searchMode.value = searchMode.value === mode ? 'area' : mode
}

function areaPoint(event: PointerEvent) {
  const matrix = mapSurface.value?.getScreenCTM()
  const guide = suggestionGuide.value
  if (!matrix || !guide) return
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
  const padding = mapPadding.value
  const clamp = (value: number, size: number) => Math.max(-padding, Math.min(size + padding, value)) / size
  return { x: clamp(point.x, guide.width), y: clamp(point.y, guide.height) }
}

function startArea(event: PointerEvent) {
  if (!(searchPiece.value || drawingJunction.value) || busy.value || event.button !== 0 || gesture) return
  const point = areaPoint(event)
  if (!point) return
  event.preventDefault()
  if (searchMode.value === 'bottom') {
    const id = searchPiece.value
    endSearch()
    void suggest(id, true, point)
    return
  }
  if (searchMode.value === 'center') {
    const id = searchPiece.value
    const previous = poses.value.get(id)
    const angle = searchCenters.get(id)?.angle ?? (previous?.reliable ? previous.angle : undefined)
    searchCenters.set(id, { ...point, angle })
    void suggest(searchPiece.value)
    return
  }
  gesture = { pointer: event.pointerId, piece: searchPiece.value, direction: drawingDirection.value,
    junction: drawingJunction.value, ...point }
  const box = adjustLoadedTarget.value ? activeTargetPose.value?.target : undefined
  const cornerName = (event.target as SVGElement).dataset.targetCorner
  gesture.corner = targetCorners.find(corner => corner.name === cornerName)
  if (box && (gesture.corner || (point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height)))
    gesture.moveTarget = box
  mapSurface.value?.setPointerCapture(event.pointerId)
}

function moveArea(event: PointerEvent) {
  if (gesture?.pointer !== event.pointerId) return
  const end = areaPoint(event)
  if (!end) return
  if (searchMode.value === 'edge') {
    pendingEdge.value = { start: { x: gesture.x, y: gesture.y }, end }
    return
  }
  if (gesture.direction && suggestionGuide.value) {
    const dx = (end.x - gesture.x) * suggestionGuide.value.width
    const dy = (end.y - gesture.y) * suggestionGuide.value.height
    pendingDirection.value = Math.hypot(dx, dy) < 18 ? undefined : Math.round(Math.atan2(dy, dx) * 180 / Math.PI)
    return
  }
  const box = gesture.moveTarget
  if (box) {
    const guide = suggestionGuide.value!
    const dx = end.x - gesture.x
    const dy = end.y - gesture.y
    if (Math.hypot(dx * guide.width, dy * guide.height) < 4) {
      pendingArea.value = undefined
      return
    }
    const padding = mapPadding.value
    if (gesture.corner) {
      const { x, y } = gesture.corner
      const anchorX = box.x + (1 - x) * box.width
      const anchorY = box.y + (1 - y) * box.height
      const diagonalX = (2 * x - 1) * box.width * guide.width
      const diagonalY = (2 * y - 1) * box.height * guide.height
      const desiredScale = 1 + (dx * guide.width * diagonalX + dy * guide.height * diagonalY) / (diagonalX ** 2 + diagonalY ** 2)
      const maxWidth = (x ? 1 - anchorX : anchorX) + padding / guide.width
      const maxHeight = (y ? 1 - anchorY : anchorY) + padding / guide.height
      const minScale = Math.max(4 / (box.width * guide.width), 4 / (box.height * guide.height))
      const scale = Math.max(minScale, Math.min(desiredScale, maxWidth / box.width, maxHeight / box.height))
      const width = box.width * scale
      const height = box.height * scale
      pendingArea.value = { x: anchorX - (1 - x) * width, y: anchorY - (1 - y) * height, width, height }
      return
    }
    const bound = (value: number, length: number, size: number) => {
      const margin = padding / size
      return Math.max(-margin, Math.min(1 + margin - length, value))
    }
    pendingArea.value = { ...box, x: bound(box.x + dx, box.width, guide.width), y: bound(box.y + dy, box.height, guide.height) }
    return
  }
  pendingArea.value = { x: Math.min(gesture.x, end.x), y: Math.min(gesture.y, end.y),
    width: Math.abs(end.x - gesture.x), height: Math.abs(end.y - gesture.y) }
}

function cancelArea() {
  gesture = undefined
  pendingArea.value = undefined
  pendingDirection.value = undefined
  pendingEdge.value = undefined
}

function endSearch() {
  targetUndo.value = undefined
  editingTargetAngle = false
  adjustLoadedTarget.value = false
  searchPiece.value = 0
  searchMode.value = 'area'
  cancelArea()
}

function finishArea(event: PointerEvent) {
  if (gesture?.pointer !== event.pointerId) return
  moveArea(event)
  const area = pendingArea.value
  const angle = pendingDirection.value
  const id = gesture.piece
  const junction = gesture.junction
  const edge = pendingEdge.value
  cancelArea()
  if (searchMode.value === 'edge') {
    const piece = preview.value.find(item => item.id === id)
    const pose = poses.value.get(id)
    const guide = suggestionGuide.value
    if (!edge || !piece?.opening || !pose || !guide || !originalReferenceWidth.value) return
    const width = originalReferenceWidth.value
    const result = fitMaterialEdge(pose, piece.opening, piece, { width, height: width * guide.height / guide.width }, edge)
    error.value = result ? '' : 'measureEdgeUnclear'
    if (result) {
      poses.value = new Map(poses.value).set(id, result)
      accepted.value = accepted.value.filter(value => value !== id)
    }
    return
  }
  if (targetMode.value) {
    const guide = suggestionGuide.value
    if (!area || !guide || area.width * guide.width < 4 || area.height * guide.height < 4) return
    const previous = activeTargetPose.value
    const angle = previous?.target ? previous.angle : searchAreas.get(id)?.angle ?? 0
    rememberTargetEdit()
    poses.value = new Map(poses.value).set(id, { target: area, x: area.x + area.width / 2, y: area.y + area.height / 2,
      scale: 1, angle, targetFit: previous?.targetFit, heightRatio: previous?.heightRatio, layoutOrder: previous?.layoutOrder,
      cutOuterOnly: previous?.cutOuterOnly,
      score: 0, reliable: true })
    if (!accepted.value.includes(id)) accepted.value.push(id)
    return
  }
  if (junction) {
    if (!area || area.width < 0.01 || area.height < 0.01 || !canCheckJunction.value) return
    junctionArea.value = area
    drawingJunction.value = false
    void checkReferenceStack(area)
    return
  }
  if (angle !== undefined) {
    const existing = searchAreas.get(id)
    if (!existing) return
    searchAreas.set(id, { ...existing, angle })
    searchMode.value = 'area'
    void suggest(id)
    return
  }
  if (!area || area.width < 0.01 || area.height < 0.01) return
  searchAreas.set(id, { ...area, angle: searchAreas.get(id)?.angle })
  void suggest(id)
}

function clearArea() {
  searchAreas.delete(searchPiece.value)
  searchMode.value = 'area'
  void suggest(searchPiece.value)
}

function clearDirection() {
  const area = searchAreas.get(searchPiece.value)
  if (!area) return
  searchAreas.set(searchPiece.value, { ...area, angle: undefined })
  void suggest(searchPiece.value)
}

function clearCenter() {
  searchCenters.delete(searchPiece.value)
  void suggest(searchPiece.value)
}

function clearTarget() {
  targetUndo.value = undefined
  editingTargetAngle = false
  const next = new Map(poses.value)
  next.delete(searchPiece.value)
  poses.value = next
  accepted.value = accepted.value.filter(id => id !== searchPiece.value)
  searchMode.value = 'area'
  void suggest(searchPiece.value)
}

function rememberTargetEdit() {
  const id = searchPiece.value
  targetUndo.value = { pose: poses.value.get(id), approved: accepted.value.includes(id), flagged: flaggedFrames.has(id) }
}

function undoTargetEdit() {
  const previous = targetUndo.value
  if (!previous || !targetMode.value) return
  const id = searchPiece.value
  cancelArea()
  const next = new Map(poses.value)
  if (previous.pose) next.set(id, previous.pose)
  else next.delete(id)
  poses.value = next
  accepted.value = accepted.value.filter(value => value !== id)
  if (previous.approved) accepted.value.push(id)
  if (previous.flagged) flaggedFrames.add(id)
  else flaggedFrames.delete(id)
  targetUndo.value = undefined
  editingTargetAngle = false
}

// [TINIX] Keep temporary input such as an empty field out of the saved pose.
function changeTargetAngle(event: Event) {
  const pose = activeTargetPose.value
  const angle = (event.target as HTMLInputElement).valueAsNumber
  if (!pose || !Number.isFinite(angle) || angle < -180 || angle > 180 || angle === pose.angle) return
  if (!editingTargetAngle) rememberTargetEdit()
  editingTargetAngle = true
  poses.value = new Map(poses.value).set(searchPiece.value, { ...pose, angle })
}

function commitTargetAngle(event: Event) {
  changeTargetAngle(event)
  editingTargetAngle = false
  const input = event.target as HTMLInputElement
  input.value = String(activeTargetPose.value?.angle ?? 0)
}

function changeTargetFit(event: Event) {
  const pose = activeTargetPose.value
  if (!pose) return
  const targetFit = (event.target as HTMLSelectElement).value as MaterialTargetFit
  if (targetFit === (pose.targetFit ?? 'contain')) return
  rememberTargetEdit()
  poses.value = new Map(poses.value).set(searchPiece.value, { ...pose, targetFit })
}

function poseTransform(id: number) {
  const pose = poses.value.get(id)!
  const guide = suggestionGuide.value!
  return `translate(${pose.x * guide.width} ${pose.y * guide.height})`
}

function poseLabel(id: number) {
  const pose = poses.value.get(id)!
  return t(prefix + (pose.measuredEdge ? 'measuredEdgePose' : pose.fromLayout ? 'layoutPose' : pose.bottomFit ? 'archBottomPose' : pose.paperFit ? 'paperFitPose' : pose.diagramShift ? 'diagramShiftPose' : pose.heightRatio ? 'openingFitPose' : pose.frameCode ? 'codedPose' : pose.target ? 'targetPose' : pose.reliable ? 'pose' : 'reviewPose'), {
    code: pose.frameCode ?? pose.decorationCode,
    x: Math.round(pose.x * 100), y: Math.round(pose.y * 100), angle: pose.angle,
  })
}

function suggestAll() {
  void suggest(undefined, false)
}

// [TINIX] Keep hand edits and require confirmation for each imported position.
async function suggestLayout() {
  const file = layoutFile.value
  const sheet = files.sheet
  const reference = files.reference
  const image = source.value
  if (!file || !sheet || !reference || !image || busy.value) return
  busy.value = true
  error.value = ''
  layoutResult.value = undefined
  try {
    if (file.size > 64 * 1024) throw new Error('Material layout too large')
    const original = await readCutoutImage(await readCutoutFile(reference))
    const size = { width: original.naturalWidth, height: original.naturalHeight }
    const layout = parseMaterialLayout(await file.text(), { file: sheet.name, width: image.width, height: image.height },
      { file: reference.name, ...size })
    suggestionGuide.value ??= await loadReferenceGuide(reference)
    originalReferenceWidth.value = size.width
    diagramPreview.value = ''
    matchLayoutPieces(layout, image, size)
  } catch {
    error.value = 'layoutInvalid'
  } finally {
    busy.value = false
  }
}

// [TINIX] Apply the same placements to folder and ZIP imports.
function matchLayoutPieces(layout: ReturnType<typeof parseMaterialLayout>, image: ImageData, size: { width: number; height: number }) {
  const matches = matchMaterialLayout(layout.placements, preview.value.map(piece => ({
    bounds: pieceBounds(piece, image.width), frame: piece.role === 'frame', hero: piece.role === 'hero',
    code: piece.frameCode, edited: poses.value.has(piece.id) || searchAreas.has(piece.id) || searchCenters.has(piece.id),
  })), size)
  const next = new Map(poses.value)
  for (const { index, pose } of matches) {
    const piece = preview.value[index]
    if (pose.frameCode) piece.frameCode = pose.frameCode
    next.set(piece.id, pose)
  }
  poses.value = next
  subjectZ.value = layout.subjectZ
  subject.value = layout.subject
  printSize.value = layout.printSize
  layoutResult.value = { matched: matches.length, total: layout.placements.length,
    decorations: layout.placements.filter(item => item.code.startsWith('D')).length }
  return matches
}

// [TINIX] The diagram locates frame artwork; the original photo stays the editor reference.
async function suggest(id?: number, useDiagram = Boolean(diagramPreview.value), archBottom?: { x: number; y: number }) {
  if (!files.reference || !source.value || busy.value) return
  const targets = preview.value.filter(piece => {
    const pose = poses.value.get(piece.id)
    return (!id || piece.id === id) && (!useDiagram || piece.role === 'frame') &&
      (archBottom || (!pose?.target && (id || !pose?.fromLayout)))
  })
  if (!targets.length) return
  busy.value = true
  error.value = ''
  const sourceImage = source.value
  try {
    diagramPreview.value = ''
    if (!referencePixels) {
      const [original, guide] = await Promise.all([materialPixels(files.reference), suggestionGuide.value ?? loadReferenceGuide(files.reference)])
      const full = cutoutCanvas(original.width, original.height)
      full.context.putImageData(original, 0, 0)
      const width = Math.min(240, original.width)
      const height = Math.round(original.height * width / original.width)
      const small = cutoutCanvas(width, height)
      small.context.drawImage(full.canvas, 0, 0, width, height)
      referencePixels = { reference: small.context.getImageData(0, 0, width, height), originalWidth: original.width }
      originalReferenceWidth.value = original.width
      suggestionGuide.value = guide
    }
    let matchPixels = referencePixels
    let diagramAreas: MaterialDiagramArea[] | undefined
    let openingReference: ImageData | undefined
    if (useDiagram && files.diagram) {
      const [diagram, previewGuide] = await Promise.all([materialPixels(files.diagram), loadReferenceGuide(files.diagram)])
      const { width, height } = referencePixels.reference
      if (Math.abs(Math.log(diagram.width / diagram.height / (width / height))) > .035) {
        error.value = 'diagramRatio'
        return
      }
      const full = cutoutCanvas(diagram.width, diagram.height)
      full.context.putImageData(diagram, 0, 0)
      const small = cutoutCanvas(width, height)
      small.context.drawImage(full.canvas, 0, 0, width, height)
      matchPixels = { ...referencePixels, reference: small.context.getImageData(0, 0, width, height) }
      diagramAreas = diagramSearchAreas(diagram, createDiagramCodeReader())
      const edgeWidth = Math.min(280, diagram.width)
      const edgeHeight = Math.round(diagram.height * edgeWidth / diagram.width)
      const edge = cutoutCanvas(edgeWidth, edgeHeight)
      edge.context.drawImage(full.canvas, 0, 0, edgeWidth, edgeHeight)
      openingReference = edge.context.getImageData(0, 0, edgeWidth, edgeHeight)
      diagramPreview.value = previewGuide.image
    }
    const request: MatchRequest = {
      ...matchPixels,
      diagram: useDiagram,
      diagramAreas,
      openingReference,
      photoReference: useDiagram ? referencePixels.reference : undefined,
      source: sourceImage, pieces: targets.map(piece => {
        const area = searchAreas.get(piece.id)
        const center = searchCenters.get(piece.id)
        return { pixels: piece.pixels, bounds: pieceBounds(piece, sourceImage.width),
          searchArea: area && { ...area }, searchCenter: center && { ...center },
          roundOpening: useDiagram && hasRoundDiagramOpening(piece.opening),
          archBottom,
          frameCode: useDiagram ? piece.frameCode : undefined,
          opening: useDiagram ? piece.opening?.map(({ x, y }) => ({ x, y })) : undefined,
          openingSize: useDiagram ? { width: piece.width, height: piece.height } : undefined }
      }),
    }
    const result = await new Promise<Array<MaterialPose | undefined>>((resolve, reject) => {
      worker = new Worker(new URL('@/utils/tinix/material-placement.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = event => resolve(event.data)
      worker.onerror = reject
      worker.postMessage(request)
    })
    const nextPoses = new Map(poses.value)
    const nextAccepted = new Set(accepted.value)
    targets.forEach((piece, index) => {
      const pose = result[index]
      if (archBottom && !pose?.bottomFit) {
        error.value = 'archBottomUnclear'
        return
      }
      nextPoses.delete(piece.id)
      nextAccepted.delete(piece.id)
      if (pose) nextPoses.set(piece.id, pose)
      if (pose && (pose.reliable || searchCenters.has(piece.id))) nextAccepted.add(piece.id)
    })
    poses.value = nextPoses
    accepted.value = [...nextAccepted]
    if (useDiagram && targets.some((piece, index) => piece.frameCode && !result[index])) error.value = 'diagramCodeMissing'
  } catch {
    error.value = 'suggestError'
  } finally {
    worker?.terminate()
    worker = undefined
    busy.value = false
  }
}

// [TINIX] Populate empty roles only; a late scan must not replace user choices or a newer folder.
async function loadFolder(event: Event) {
  const entries = [...((event.target as HTMLInputElement).files || [])]
  const images = entries.filter(file => /^image\/(png|jpeg|webp)$/.test(file.type))
  const layouts = entries.filter(file => file.name.toLowerCase() === 'layout.json')
  layoutFile.value = layouts.length === 1 ? layouts[0] : undefined
  folderFiles.value = images
  for (const kind of kinds) files[kind] = undefined
  guessingFiles.value = !!images.length
  const suggested = await suggestMaterialFolder(images)
  if (folderFiles.value !== images || !props.open) return
  guessingFiles.value = false
  for (const kind of kinds) {
    const file = suggested[kind]?.file
    if (file && !files[kind] && !kinds.some(other => files[other] === file)) files[kind] = file
  }
}

// [TINIX] Check the bundle first, then reuse the standard scan, placement and canvas import.
function resetArchiveCheck() {
  if (archiveSheet.value) URL.revokeObjectURL(archiveSheet.value.url)
  archiveCheck.value = undefined
  verifiedArchive.value = undefined
  archiveSheet.value = undefined
  archiveRegion.value = undefined
  archivePoint.value = undefined
  archiveFrameCodes.value = []
  archiveDuplicates.value = {}
  archiveDuplicateWorker.value?.terminate()
  archiveDuplicateWorker.value = undefined
  archiveDuplicateResults.value.clear()
  requestedDuplicateRegions.clear()
  archiveName.value = ''
  archiveCopyState.value = undefined
}

function classifyArchiveRegion(id: string, code: string) {
  if (archiveFrameCodes.value.includes(code)) archiveDuplicates.value[id] = code
  else delete archiveDuplicates.value[id]
  archiveCopyState.value = undefined
}

function prepareArchiveDuplicateSuggestions(image: ImageData, frames: ArchiveRegion[]) {
  let matcher: Worker
  try {
    matcher = new Worker(new URL('@/utils/tinix/material-duplicate-pattern.worker.ts', import.meta.url), { type: 'module' })
    matcher.postMessage({ image, frames } satisfies DuplicatePatternRequest)
  } catch {
    return
  }
  archiveDuplicateWorker.value = matcher
  matcher.onmessage = ({ data }: MessageEvent<DuplicatePatternResult>) => {
    if (archiveDuplicateWorker.value === matcher) archiveDuplicateResults.value.set(data.id, data.frame)
  }
  matcher.onerror = () => {
    matcher.terminate()
    if (archiveDuplicateWorker.value === matcher) archiveDuplicateWorker.value = undefined
  }
}

function archiveReportRegion(label: string, bounds?: ArchiveRegion['bounds']) {
  if (!bounds) return label
  const { left, top, right, bottom } = bounds
  return `${label} · x=${left}, y=${top}, width=${right - left}, height=${bottom - top}`
}

async function copyArchiveReport() {
  const check = archiveCheck.value
  if (!check) return
  const report = archiveReportText.value
  try {
    await navigator.clipboard.writeText(report)
    if (archiveCheck.value === check && archiveReportText.value === report) archiveCopyState.value = 'archiveCopyDone'
  } catch {
    if (archiveCheck.value !== check) return
    archiveCopyState.value = 'archiveCopyManual'
    await nextTick()
    if (archiveCheck.value !== check) return
    archiveCopyText.value?.focus()
    archiveCopyText.value?.select()
  }
}

function showArchiveSheet(file: File, { width, height }: ImageData) {
  archiveSheet.value = { url: URL.createObjectURL(file), width, height }
}

function readArchivePoint(event: PointerEvent) {
  const svg = event.currentTarget as SVGSVGElement
  const matrix = svg.getScreenCTM()
  const sheet = archiveSheet.value
  if (!matrix || !sheet) return
  const { x, y } = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
  archivePoint.value = x >= 0 && y >= 0 && x < sheet.width && y < sheet.height ? { x: Math.floor(x), y: Math.floor(y) } : undefined
}

async function loadArchive(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || busy.value) return
  busy.value = true
  error.value = ''
  resetArchiveCheck()
  try {
    const opened = await openMaterialArchive(file)
    if (opened.kind === 'missing') {
      const { bundle, fields } = opened
      if (fields.some(gap => gap.bounds)) {
        const image = await materialPixels(bundle.sheet)
        for (const gap of fields) {
          if (gap.bounds && (gap.bounds.right > image.width || gap.bounds.bottom > image.height)) gap.bounds = undefined
        }
        if (fields.some(gap => gap.bounds)) showArchiveSheet(bundle.sheet, image)
      }
      archiveName.value = file.name
      archiveCheck.value = { alpha: [], source: [], unlisted: [], frames: [], fields }
      return
    }
    const { layout, bundle, image, guide, background, size, manifest } = opened
    restoring = true
    try {
      Object.assign(files, bundle)
      layoutFile.value = layout
      folderFiles.value = Object.values(bundle)
      guessingFiles.value = false
      resetSheetScan()
      originalSource.value = image
      threshold.value = suggestSheetThreshold(image)
      rescan()
      referencePixels = undefined
      suggestionGuide.value = guide
      originalReferenceWidth.value = size.width
      await nextTick()
    } finally {
      restoring = false
    }
    const matches = matchLayoutPieces(manifest, image, size)
    archiveImport.value = true
    const check = checkMaterialArchive(image, manifest.placements, preview.value)
    archiveName.value = file.name
    archiveFrameCodes.value = check.frames.map(frame => frame.id)
    archiveCheck.value = check
    if (check.unlisted.length && check.frames.length && typeof Worker !== 'undefined') {
      prepareArchiveDuplicateSuggestions(image, check.frames)
    }
    const hasWarnings = hasMaterialArchiveWarnings(check)
    if (hasWarnings) showArchiveSheet(bundle.sheet, image)
    if (hasWarnings ||
        matches.length !== manifest.placements.length ||
        matches.filter(match => match.pose.frameCode).length !== preview.value.filter(piece => piece.role === 'frame').length) {
      error.value = 'archiveIncomplete'
      return
    }
    accepted.value = [...poses.value.keys()]
    verifiedArchive.value = { guide, background }
  } catch {
    error.value = 'archiveInvalid'
  } finally {
    busy.value = false
  }
}
function applyVerifiedArchive() {
  if (verifiedArchive.value) return apply(verifiedArchive.value)
}
function chooseFolderFile(kind: Kind, event: Event) {
  files[kind] = folderFiles.value.find(file => folderFileKey(file) === (event.target as HTMLSelectElement).value)
}
function chooseFile(kind: Kind, event: Event) {
  files[kind] = (event.target as HTMLInputElement).files?.[0]
}
function changeFrameCode(piece: typeof preview.value[number], event: Event) {
  layoutResult.value = undefined
  piece.frameCode = (event.target as HTMLSelectElement).value || undefined
  if (poses.value.get(piece.id)?.target) return
  const next = new Map(poses.value)
  next.delete(piece.id)
  poses.value = next
  accepted.value = accepted.value.filter(id => id !== piece.id)
}
function editOpening(id: number) {
  endSearch()
  openingId.value = id
  void nextTick(() => openingPanel.value?.scrollIntoView({ block: 'nearest' }))
}

function useOpening(opening: PieceOpening | undefined) {
  if (!openingPiece.value) return
  openingPiece.value.opening = opening?.map(point => ({ ...point }))
  openingPiece.value.automaticOpening = undefined
  openingId.value = 0
}

// [TINIX] Only initial guesses and changed automatic outlines use detection. Keep explicit role and contour edits.
function card(piece: SheetPiece, role?: PieceRole, id = nextId++, opening?: PieceOpening, automaticOpening?: boolean, frameCode?: string) {
  const { url, width, height, detectedOpening } = previewMaterialPiece(source.value!, piece, threshold.value, role === undefined)
  return { pixels: markRaw(piece.pixels), id, role: role ?? (detectedOpening ? 'frame' : 'sticker'), url, width, height,
    opening: opening ?? detectedOpening, automaticOpening: automaticOpening || (detectedOpening ? true : undefined), frameCode }
}

// [TINIX] Preserve editor state only for cards retained by the rescan matcher.
function retainPieceEdits(next: typeof preview.value) {
  const ids = new Set(next.map(piece => piece.id))
  const previousOrder = layerOrder.value.map(({ piece }) => piece.id).filter(id => ids.has(id))
  const lostAnchor = moves.value.some(move => ids.has(move.piece) && !ids.has(move.anchor))
  moves.value = lostAnchor
    ? previousOrder.slice(1).map((piece, i) => ({ piece, anchor: previousOrder[i], above: true }))
    : moves.value.filter(move => ids.has(move.piece) && ids.has(move.anchor))
  poses.value = new Map([...poses.value].filter(([id]) => ids.has(id)))
  accepted.value = accepted.value.filter(id => ids.has(id))
  selected.value = selected.value.filter(id => ids.has(id))
  for (const id of searchAreas.keys()) if (!ids.has(id)) searchAreas.delete(id)
  for (const id of searchCenters.keys()) if (!ids.has(id)) searchCenters.delete(id)
  if (!ids.has(searchPiece.value)) endSearch()
  if (!ids.has(openingId.value)) openingId.value = 0
  if (!ids.has(movingPiece.value)) movingPiece.value = 0
  if (!ids.has(anchorPiece.value)) anchorPiece.value = 0
  if (!ids.has(highlighted.value)) highlighted.value = 0
  preview.value = next
}

function currentScan(): ScanEdits {
  return {
    pieces: preview.value.map(piece => ({ ...piece })), review: reviewPieces.value,
    poses: new Map(poses.value), accepted: [...accepted.value], areas: new Map(searchAreas),
    centers: new Map(searchCenters), moves: [...moves.value],
  }
}

function packScan(scan: ScanEdits): MaterialScanState {
  return {
    pieces: scan.pieces.map(({ id, role, pixels, opening, automaticOpening, frameCode }) => ({
      id, role, runs: encodeMaterialPixels(pixels), opening, automaticOpening, frameCode,
    })),
    review: [...scan.review], poses: [...scan.poses], accepted: scan.accepted,
    areas: [...scan.areas], centers: [...scan.centers], moves: scan.moves,
  }
}

async function saveSession() {
  if (busy.value) return false
  if (sessionSaved.value || !kinds.some(kind => files[kind])) return true
  busy.value = true
  error.value = ''
  try {
    const entries = await Promise.all(kinds.map(async kind => {
      const file = files[kind]
      if (!file) return
      if (file.size > 24 * 1024 ** 2) throw new Error('Material file is too large')
      const data = fileData.get(file) ?? await readCutoutFile(file)
      fileData.set(file, data)
      return [kind, { name: file.name, data }] as const
    }))
    const session: MaterialSession = {
      id: crypto.randomUUID(), version: 1, files: Object.fromEntries(entries.filter(entry => entry !== undefined)),
      threshold: threshold.value, cleanAlpha: cleanAlpha.value, referenceWidth: originalReferenceWidth.value, subjectZ: subjectZ.value,
      subject: subject.value, printSize: printSize.value,
      scan: packScan(currentScan()), recent: [...scanEdits].filter(([key]) => key !== scanKey).map(([key, value]) => [key, packScan(value)]),
    }
    if (!(await props.persistSession(session))) throw new Error('Material session draft write failed')
    sessionSaved.value = true
    return true
  } catch {
    error.value = 'sessionSaveError'
    return false
  } finally {
    busy.value = false
  }
}

async function requestClose(done: () => void) {
  if (await saveSession()) done()
}

function closeDialog(open: boolean) {
  if (!open) emit('close')
}

function saveWhileOpen() {
  void saveSession()
}

async function loadSession(session: MaterialSession) {
  restoring = true
  busy.value = true
  try {
    if (session.version !== 1 || !Number.isInteger(session.threshold) || session.threshold < 4 || session.threshold > 254) throw new Error('Invalid material session')
    const restoredFiles = Object.fromEntries(kinds.flatMap(kind => {
      const entry = session.files[kind]
      if (!entry) return []
      const file = restoreMaterialFile(entry)
      fileData.set(file, entry.data)
      return [[kind, file]]
    }))
    const original = restoredFiles.sheet ? await materialPixels(restoredFiles.sheet) : undefined
    const pixelLimit = original ? original.width * original.height : 0
    const restoreScan = (scan: MaterialScanState, active: boolean): ScanEdits => ({
      pieces: decodeMaterialScan(scan, pixelLimit).map(piece => active ? card(piece, piece.role, piece.id, piece.opening, piece.automaticOpening, piece.frameCode)
        : { ...piece, pixels: markRaw(piece.pixels), url: '', width: 0, height: 0 }),
      review: new Set(scan.review), poses: new Map(scan.poses), accepted: [...scan.accepted],
      areas: new Map(scan.areas), centers: new Map(scan.centers), moves: [...scan.moves],
    })
    const guide = restoredFiles.reference && session.scan.poses.length ? await loadReferenceGuide(restoredFiles.reference) : undefined
    originalSource.value = original
    threshold.value = session.threshold
    cleanAlpha.value = session.cleanAlpha
    const saved = restoreScan(session.scan, true)
    const recent = session.recent.slice(-3).map(([key, scan]) => [key, restoreScan(scan, false)] as const)
    Object.assign(files, restoredFiles)
    const order = session.subjectZ
    subjectZ.value = typeof order === 'number' && Number.isInteger(order) && order >= 0 && order <= 10000 ? order : undefined
    const savedSubject = session.subject
    printSize.value = isMaterialPrintSize(session.printSize) ? session.printSize : undefined
    if (subjectZ.value !== undefined && savedSubject &&
        [savedSubject.x, savedSubject.y, savedSubject.width, savedSubject.height].every(value => Number.isFinite(value) && value >= 0 && value <= 1) &&
        savedSubject.width > 0 && savedSubject.height > 0 &&
        Number.isFinite(savedSubject.angle) && Math.abs(savedSubject.angle) <= 180 &&
        Number.isFinite(savedSubject.borderMm) && savedSubject.borderMm >= 0 && savedSubject.borderMm <= 15)
      subject.value = savedSubject
    preview.value = saved.pieces
    reviewPieces.value = saved.review
    poses.value = saved.poses
    accepted.value = saved.accepted
    for (const [id, area] of saved.areas) searchAreas.set(id, area)
    for (const [id, center] of saved.centers) searchCenters.set(id, center)
    moves.value = saved.moves
    suggestionGuide.value = guide
    originalReferenceWidth.value = session.referenceWidth
    scanKey = `${threshold.value}/${Number(cleanAlpha.value)}`
    for (const [key, scan] of recent) scanEdits.set(key, scan)
    nextId = [saved, ...scanEdits.values()].reduce((next, scan) =>
      scan.pieces.reduce((maximum, piece) => Math.max(maximum, piece.id + 1), next), 1)
  } catch {
    originalSource.value = undefined
    error.value = 'sessionLoadError'
  } finally {
    await nextTick()
    restoring = false
    busy.value = false
  }
}

function rescan() {
  layoutResult.value = undefined
  const image = source.value
  if (!image) return
  threshold.value = Math.max(4, Math.min(254, Math.round(threshold.value || 8)))
  const key = `${threshold.value}/${Number(cleanAlpha.value)}`
  if (scanKey && scanKey !== key) {
    scanEdits.delete(scanKey)
    scanEdits.set(scanKey, currentScan())
    if (scanEdits.size > 3) scanEdits.delete(scanEdits.keys().next().value!)
  }
  const cached = scanKey !== key ? scanEdits.get(key) : undefined
  scanKey = key
  const previous = preview.value
  const pieces = sheetPieces(image, threshold.value)
  const matches = matchRescannedPieces(previous, pieces, image.width, image.height)
  const cachedMatches = cached ? matchRescannedPieces(cached.pieces, pieces, image.width, image.height) : undefined
  const liveHero = [...matches.values()].some(match => previous[match.previousIndex].role === 'hero')
  const liveIds = new Set([...matches.values()].map(match => previous[match.previousIndex].id))
  const restored = new Set<number>()
  const needsReview = new Set<number>()
  const next = pieces.map((piece, index) => {
    const match = matches.get(index)
    if (!match) {
      const archivedMatch = cachedMatches?.get(index)
      const archived = archivedMatch?.exact && cached?.pieces[archivedMatch.previousIndex]
      if (archived && !liveIds.has(archived.id)) {
        const role = archived.role === 'hero' && liveHero ? 'sticker' : archived.role
        const recovered = card(piece, role, archived.id, archived.opening, archived.automaticOpening, archived.frameCode)
        if (role === archived.role) restored.add(archived.id)
        if (role !== archived.role || cached?.review.has(archived.id)) needsReview.add(archived.id)
        return recovered
      }
      const created = card(piece)
      if (previous.length) needsReview.add(created.id)
      return created
    }
    const original = previous[match.previousIndex]
    const refreshOpening = original.automaticOpening && !match.exact
    const updated = refreshOpening ? card(piece, undefined, original.id, undefined, undefined, original.frameCode)
      : card(piece, original.role, original.id, original.opening, original.automaticOpening, original.frameCode)
    if (refreshOpening && original.role !== 'frame') updated.role = original.role
    if (!match.exact || reviewPieces.value.has(updated.id) || updated.url !== original.url) needsReview.add(updated.id)
    return updated
  })
  reviewPieces.value = needsReview
  retainPieceEdits(next)
  if (cached && restored.size) {
    for (const id of restored) {
      const pose = cached.poses.get(id)
      const area = cached.areas.get(id)
      const center = cached.centers.get(id)
      if (pose) poses.value.set(id, pose)
      if (area) searchAreas.set(id, area)
      if (center) searchCenters.set(id, center)
      if (cached.accepted.includes(id)) accepted.value.push(id)
    }
    poses.value = new Map(poses.value)
    const present = new Set(next.map(piece => piece.id))
    const archivedMoves = cached.moves.filter(move => present.has(move.piece) && present.has(move.anchor) &&
      (restored.has(move.piece) || restored.has(move.anchor)))
    moves.value = [...archivedMoves, ...moves.value]
  }
  error.value = preview.value.length ? '' : 'empty'
}

// [TINIX] Start a new scan for either a loose sheet or a material ZIP.
function resetSheetScan() {
  resetArchiveCheck()
  scanKey = undefined
  scanEdits.clear()
  originalSource.value = undefined
  cleanAlpha.value = false
  preview.value = []
  reviewPieces.value = new Set()
  selected.value = []
  resetPlacement()
}

watch(() => files.sheet, async (sheet) => {
  if (restoring) return
  resetSheetScan()
  error.value = ''
  busy.value = Boolean(sheet)
  if (!sheet) return
  try {
    if (sheet.type !== 'image/png') throw new Error()
    const image = await materialPixels(sheet)
    if (files.sheet !== sheet) return
    for (let i = 3; i < image.data.length; i += 4) {
      if (image.data[i] < 16) {
        originalSource.value = image
        break
      }
    }
    if (!source.value) throw new Error()
    threshold.value = suggestSheetThreshold(image)
    rescan()
  } catch {
    if (files.sheet === sheet) error.value = 'invalid'
  } finally {
    if (files.sheet === sheet) busy.value = false
  }
})

function replace(parts: SheetPiece[]) {
  const first = preview.value.findIndex(piece => selected.value.includes(piece.id))
  const original = preview.value[first]
  const role = original.automaticOpening && original.role === 'frame' ? undefined : original.role
  const remaining = preview.value.filter(piece => !selected.value.includes(piece.id))
  remaining.splice(first, 0, ...parts.map((piece, index) => card(piece, index === 0 ? role : undefined)))
  reviewPieces.value = new Set(remaining.filter(piece => reviewPieces.value.has(piece.id) ||
    !preview.value.some(previous => previous.id === piece.id)).map(piece => piece.id))
  retainPieceEdits(remaining)
  selected.value = []
  error.value = ''
}
function merge() {
  replace([{ pixels: preview.value.filter(piece => selected.value.includes(piece.id)).flatMap(piece => piece.pixels) }])
}
function split(axis: 'x' | 'y') {
  const width = source.value!.width
  const piece = preview.value.find(item => item.id === selected.value[0])!
  const { left, top, right, bottom } = pieceBounds(piece, width)
  const start = axis === 'x' ? left : top
  const end = axis === 'x' ? right : bottom
  const at = start + (end - start) * splitAt.value / 100
  const first: number[] = []; const second: number[] = []
  for (const p of piece.pixels) ((axis === 'x' ? p % width : Math.floor(p / width)) < at ? first : second).push(p)
  if (!first.length || !second.length) { error.value = 'invalidSplit'; return }
  replace([{ pixels: first }, { pixels: second }])
}

async function apply(prepared?: { guide: CanvasReferenceGuide; background: string }) {
  const image = source.value
  if (!image || !ready.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const pieces = layerOrder.value.map(({ piece, index }) => ({
      ...pieceImage(image, piece, threshold.value, piece.role, piece.opening, piece.automaticOpening ? 'preserve' : undefined), role: piece.role,
      pose: accepted.value.includes(piece.id) ? poses.value.get(piece.id) : undefined, index,
      cutOuterOnly: poses.value.get(piece.id)?.cutOuterOnly === true || undefined,
    }))
    let assets = prepared
    if (!assets) {
      const [guide, backdrop] = await Promise.all([loadReferenceGuide(files.reference!), loadReferenceGuide(files.background!)])
      assets = { guide, background: backdrop.image }
    }
    const { guide, background } = assets
    for (const piece of pieces) {
      if (piece.pose) piece.pose = { ...piece.pose, scale: materialPoseScale(piece.pose, piece, guide, originalReferenceWidth.value) }
    }
    emit('apply', { guide, background, pieces, width: image.width, height: image.height,
      subjectZ: subjectZ.value, subject: subject.value, printSize: printSize.value, archive: archiveImport.value })
  } catch {
    error.value = 'invalid'
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.material-files, .material-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 12px; }
.material-files { padding: 0; border: 0; }
.material-files label { display: grid; gap: 4px; }
.material-archive-check { padding: 10px 12px; margin-bottom: 12px; border: 1px solid var(--el-border-color); border-radius: 6px; }
.material-archive-copy { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-block: 6px; }
.material-archive-copy-text { display: block; width: 100%; box-sizing: border-box; margin-bottom: 8px; }
.material-archive-review { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: flex-start; margin-top: 8px; }
.material-archive-review ul { flex: 1 1 300px; margin: 0; padding-inline-start: 18px; }
.material-archive-review li + li { margin-top: 6px; }
.material-archive-warnings { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
.material-archive-classification { margin-top: 6px; }
.material-archive-classify { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 6px; }
.material-archive-review button[aria-pressed='true'] { background: var(--el-color-primary-light-8); border-color: var(--el-color-primary); }
.material-archive-sheet { flex: 1 1 280px; max-width: 460px; min-width: 0; }
.material-archive-sheet-art { display: block; width: 100%; height: auto; max-height: 52vh; background: #e5e5e5; }
.material-archive-shade { fill: #181b24; opacity: .58; pointer-events: none; }
.material-archive-highlight { fill: none; stroke: #ffe14a; stroke-width: 3px; pointer-events: none; }
.material-archive-coordinates { font-variant-numeric: tabular-nums; }
.material-actions input[type=number] { width: 58px; }
.material-actions button[aria-pressed='true'] {
  background: #e7efff;
  border-color: #314f85;
  color: #19366a;
}
.material-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(116px, 1fr)); gap: 8px; max-height: 46vh; overflow: auto; }
.material-grid > div { display: grid; gap: 4px; padding: 6px; border: 1px solid #d5d9df; border-radius: 5px; }
.material-grid img { width: 100%; height: 75px; object-fit: contain; background: #ebeef1; }
.material-import { margin-top: 12px; }
.material-map { display: block; width: auto; height: min(28vh, 290px); margin: 0 auto 10px; }
.material-map-bleed { height: min(38vh, 400px); max-width: 100%; }
.material-frame-outline { fill: none; stroke: #007765; stroke-width: 2; }
.material-frame-outline .material-frame-outline-halo { stroke: #fff; stroke-width: 4; }
.material-frame-flagged { stroke: #a83013; }
.material-frame-outline-toggle[aria-pressed='true'] { background: #e7efff; border-color: #314f85; color: #19366a; }
.material-bleed-area { fill: #edf0f3; }
.material-reference-edge { fill: none; stroke: #657588; stroke-dasharray: 4 3; vector-effect: non-scaling-stroke; pointer-events: none; }
.material-map circle { fill: #314f85; stroke: #fff; stroke-width: 2; }
.material-map .pose-review circle { fill: #a75511; }
.material-map .pose-highlight circle { fill: #912a49; r: 24; }
.material-map text { fill: white; font-size: 15px; font-weight: bold; }
.material-drawing { cursor: crosshair; touch-action: none; }
.material-search-box { fill: #08f2; stroke: #1966b0; stroke-width: 6; pointer-events: none; }
.material-target-box { fill: #fff1; stroke: #087351; stroke-width: 2; vector-effect: non-scaling-stroke; pointer-events: none; }
.material-map .material-target-handle { fill: #fff; stroke: #087351; stroke-width: 2; vector-effect: non-scaling-stroke; }
.material-target-preview { opacity: .65; pointer-events: none; }
.material-junction-original { fill: none; stroke: #1966b0; stroke-width: 4; stroke-dasharray: 12 8; pointer-events: none; }
.material-direction-arrow { fill: none; stroke: #254c92; stroke-width: 9; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
.material-center-pin { pointer-events: none; }
.material-map .material-bottom-pin { fill: #087351; stroke-width: 4; pointer-events: none; }
.material-measured-edge { stroke: #087351; stroke-width: 6; pointer-events: none; }
.material-map .material-center-pin circle { fill: #fff7; stroke: #1e5792; stroke-width: 7; }
.material-center-pin path { fill: none; stroke: #1e5792; stroke-width: 6; }
.material-search-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.material-target-bleed { display: inline-flex; align-items: center; gap: 4px; }
.material-target-controls { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin: 6px 0; }
.material-target-controls label { display: inline-flex; align-items: center; gap: 4px; }
.material-target-angle { width: 72px; }
.material-layer-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; margin-bottom: 8px; }
.pose-selectable { cursor: pointer; }
</style>
