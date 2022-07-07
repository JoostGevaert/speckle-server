<template>
  <div ref="parent" class="parent no-mouse">
    <div
      v-for="comment in comments"
      :id="`comment-${comment.id}`"
      :key="comment.id"
      :ref="`comment-${comment.id}`"
      :class="`comment-bubble absolute-pos rounded-xl no-mouse `"
      :style="` z-index:${comment.expanded ? '20' : '10'}; ${
        hasExpandedComment && !comment.expanded && !comment.hovered && !comment.bouncing
          ? 'opacity: 0.1;'
          : 'opacity: 1;'
      }`"
      @mouseenter="comment.hovered = true"
      @mouseleave="comment.hovered = false"
    >
      <div class="" style="pointer-events: none">
        <div class="d-flex align-center" style="pointer-events: none">
          <v-btn
            v-show="!($vuetify.breakpoint.xs && comment.expanded)"
            :ref="`comment-button-${comment.id}`"
            small
            icon
            :class="`elevation-5 pa-0 ma-0 mouse ${
              getLeadingEmoji(comment) && !comment.expanded
                ? 'emoji-btn transparent elevation-0'
                : 'primary'
            }`"
            @click="
              comment.expanded ? collapseComment(comment) : expandComment(comment)
            "
          >
            <template v-if="!getLeadingEmoji(comment)">
              <v-icon v-if="!comment.expanded" x-small class="">mdi-comment</v-icon>
            </template>
            <template v-else-if="!comment.expanded">
              <span class="text-h5">
                {{ getLeadingEmoji(comment) }}
              </span>
            </template>
            <v-icon v-if="comment.expanded" x-small class="">mdi-close</v-icon>
          </v-btn>
          <v-slide-x-transition>
            <div
              v-if="comment.hovered && !comment.expanded"
              style="position: absolute; left: 30px; width: max-content"
              class="rounded-xl primary white--text px-2 ml-1 caption"
            >
              <timeago :datetime="comment.updatedAt" class="font-italic mr-2"></timeago>
              <v-icon x-small class="white--text">mdi-comment-outline</v-icon>
              {{ comment.replies.totalCount + 1 }}
              <v-icon v-if="comment.data.filters" x-small class="white--text">
                mdi-filter-variant
              </v-icon>
              <v-icon v-if="comment.data.sectionBox" x-small class="white--text">
                mdi-scissors-cutting
              </v-icon>
            </div>
          </v-slide-x-transition>
        </div>
      </div>
    </div>
    <!-- Comment Threads -->
    <div
      v-for="comment in comments"
      :id="`commentcard-${comment.id}`"
      :key="comment.id + '-card'"
      :ref="`commentcard-${comment.id}`"
      :class="`comment-thread simple-scrollbar hover-bg absolute-pos rounded-xl overflow-y-auto ${
        comment.hovered && false ? 'background elevation-5' : ''
      }`"
      :style="{
        zIndex: comment.expanded ? 20 : 10,
        opacity: comment.expanded ? '1' : '0',
        visibility: comment.expanded ? 'visible' : 'hidden'
      }"
      @mouseenter="comment.hovered = true"
      @mouseleave="comment.hovered = false"
    >
      <!-- <v-card class="elevation-0 ma-0 transparent" style="height: 100%"> -->
      <v-fade-transition>
        <div class="position:relative">
          <comment-thread-viewer
            :comment="comment"
            @refresh-layout="onThreadRefreshLayout"
            @close="collapseComment"
          />
        </div>
      </v-fade-transition>
      <!-- </v-card> -->
    </div>
  </div>
</template>
<script>
import * as THREE from 'three'
import { throttle } from 'lodash'
import { getComments } from '@/embed/speckleUtils'
import { documentToBasicString } from '@/main/lib/common/text-editor/documentHelper'
import CommentThreadViewer from '@/embed/EmbedCommentThreadViewer.vue'

export default {
  name: 'EmbeddedComments',
  components: { CommentThreadViewer },
  data() {
    return {
      comments: []
    }
  },
  computed: {
    hasExpandedComment() {
      return this.comments.filter((c) => c.expanded).length !== 0
    }
  },
  async mounted() {
    const resources = []
    if (this.$route.query.commit)
      resources.push({ resourceId: this.$route.query.commit, resourceType: 'commit' })
    const response = await getComments(this.$route.query.stream, resources)
    response.data.comments.items.forEach((c) => {
      c.expanded = false
      c.hovered = false
      c.bouncing = false
    })
    this.comments = [...response.data.comments.items]

    // Throttling update, cause it happens way too often and triggers expensive DOM updates
    // Smoothing out the animation with CSS transitions (check style)
    this.viewerControlsUpdateHandler = throttle(() => {
      // console.log('cameraHandler.controls update')
      this.updateCommentBubbles()
    }, 100)
    window.__viewer.cameraHandler.controls.addEventListener(
      'update',
      this.viewerControlsUpdateHandler
    )
    setTimeout(() => {
      // console.log('mounted timeout')
      this.updateCommentBubbles()
    }, 1000)
  },
  methods: {
    getLeadingEmoji(comment) {
      const emojiWhitelist = this.$store.state.emojis
      const commentPureText = documentToBasicString(comment.text.doc, 1)
      const emojiCandidate = commentPureText.split(' ')[0]
      return emojiWhitelist.includes(emojiCandidate) ? emojiCandidate : null
    },
    expandComment(comment) {
      for (const c of this.comments) {
        if (c.id === comment.id) {
          c.preventAutoClose = true
          this.$store.commit('setCommentSelection', { comment: c })
          this.setCommentPow(c)
          setTimeout(() => {
            c.expanded = true
            // console.log('expandComment 200 setTimeout')
            this.updateCommentBubbles()
          }, 200)
          setTimeout(() => {
            // prevents auto closing from camera moving to comment pow
            // console.log('expandComment 1000 setTimeout')
            c.preventAutoClose = false
            this.updateCommentBubbles()
          }, 1000)
        } else {
          c.expanded = false
        }
      }
    },
    collapseComment(comment) {
      for (const c of this.comments) {
        if (c.id === comment.id && c.expanded) {
          c.expanded = false
          if (c.data.filters) this.$store.commit('resetFilter')
          if (c.data.sectionBox) window.__viewer.sectionBox.off()
          this.$store.commit('setCommentSelection', { comment: null })
        }
      }
    },
    setCommentPow(comment) {
      const camToSet = comment.data.camPos
      if (camToSet[6] === 1) {
        window.__viewer.toggleCameraProjection()
      }
      window.__viewer.interactions.setLookAt(
        { x: camToSet[0], y: camToSet[1], z: camToSet[2] }, // position
        { x: camToSet[3], y: camToSet[4], z: camToSet[5] } // target
      )
      if (camToSet[6] === 1) {
        window.__viewer.cameraHandler.activeCam.controls.zoom(camToSet[7], true)
      }
      if (comment.data.filters) {
        this.$store.commit('setFilterDirect', { filter: comment.data.filters })
      } else {
        this.$store.commit('resetFilter')
      }

      if (comment.data.sectionBox) {
        window.__viewer.sectionBox.setBox(comment.data.sectionBox, 0)
        window.__viewer.sectionBox.on()
      } else {
        window.__viewer.sectionBox.off()
      }
    },
    onThreadRefreshLayout() {
      // console.log('thread refresh layout')
      this.updateCommentBubbles()
    },
    updateCommentBubbles() {
      // console.log('updateCommentBubbles', new Date().toISOString())
      if (!this.comments) return
      const cam = window.__viewer.cameraHandler.camera
      cam.updateProjectionMatrix()
      for (const comment of this.comments) {
        // get html elements
        const commentEl = this.$refs[`comment-${comment.id}`][0]
        const card = this.$refs[`commentcard-${comment.id}`][0]

        if (!commentEl) continue

        const location = new THREE.Vector3(
          comment.data.location.x,
          comment.data.location.y,
          comment.data.location.z
        )

        location.project(cam)

        const commentLocation = new THREE.Vector3(
          (location.x * 0.5 + 0.5) * this.$refs.parent.clientWidth,
          (location.y * -0.5 + 0.5) * this.$refs.parent.clientHeight,
          0
        )

        let tX = commentLocation.x - 20
        let tY = commentLocation.y - 20

        const paddingX = 10
        const paddingYTop = 70
        const paddingYBottom = 90

        if (tX < -300)
          if (!comment.preventAutoClose && !this.$vuetify.breakpoint.xs)
            comment.expanded = false // collapse if too far out leftwise
        if (tX < paddingX) {
          tX = paddingX
        }

        if (tX > this.$refs.parent.clientWidth - (paddingX + 50)) {
          tX = this.$refs.parent.clientWidth - (paddingX + 50)
          if (!comment.preventAutoClose && !this.$vuetify.breakpoint.xs)
            comment.expanded = false // collapse if too far down right
        }
        if (tY < 0 && !comment.preventAutoClose && !this.$vuetify.breakpoint.xs)
          comment.expanded = false // collapse if too far out topwise
        if (tY < paddingYTop) {
          tY = paddingYTop
        }

        if (
          !comment.preventAutoClose &&
          tY > this.$refs.parent.clientHeight &&
          !this.$vuetify.breakpoint.xs
        )
          comment.expanded = false // collapse if too far out down

        if (tY > this.$refs.parent.clientHeight - paddingYBottom) {
          tY = this.$refs.parent.clientHeight - paddingYBottom
        }

        commentEl.style.top = `${tY}px`
        commentEl.style.left = `${tX}px`

        const maxHeight = this.$refs.parent.clientHeight - paddingYTop - paddingYBottom

        card.style.maxHeight = `${maxHeight}px`

        if (tX > this.$refs.parent.clientWidth - (paddingX + 50 + card.scrollWidth)) {
          tX = this.$refs.parent.clientWidth - (paddingX + 50 + card.scrollWidth)
        }
        card.style.left = `${tX + 40}px`
        // card.style.right = '0px'

        let cardTop = paddingYTop

        if (card.scrollHeight > maxHeight) {
          card.style.top = `${cardTop}px`
        } else {
          cardTop = tY - card.scrollHeight / 2

          // top clip
          if (cardTop < paddingYTop) cardTop = paddingYTop

          const cardBottom = cardTop + card.clientHeight
          const maxBottom = this.$refs.parent.clientHeight - 45

          // bottom clip
          if (cardBottom > maxBottom) {
            cardTop -= (cardBottom - maxBottom) / 2
            cardTop = this.$refs.parent.clientHeight - card.clientHeight - 45
          }

          if (this.$vuetify.breakpoint.xs) cardTop = paddingYTop
          card.style.top = `${cardTop}px`
        }
      }
    }
  }
}
</script>
<style scoped lang="scss">
.no-mouse {
  pointer-events: none;
}

.mouse {
  pointer-events: auto;
}

.parent {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: 100;
}

.comment-bubble,
.comment-thread {
  $timing: 0.1s;
  $visibilityTiming: 0.2s;

  transition: left $timing linear, right $timing linear, top $timing linear,
    bottom $timing linear, opacity $visibilityTiming ease,
    visibility $visibilityTiming ease;
}
.absolute-pos {
  pointer-events: auto;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10;
  transform-origin: center;
}
.fixed-pos {
  pointer-events: auto;
  position: fixed;
  top: 0;
  left: 0;
  z-index: 10;
}
</style>
