import type { ProjectData } from '@/store/timelineStore';

export type TemplateCategory = 'blank' | 'social' | 'professional' | 'creative' | 'marketing';

export interface Template {
  id: string;
  name: string;
  nameKey: string;
  description: string;
  descriptionKey: string;
  category: TemplateCategory;
  thumbnail: string;
  gradient: string;
  width: number;
  height: number;
  fps: number;
  projectData: ProjectData;
}

export const TEMPLATE_CATEGORIES: { key: TemplateCategory | 'all'; labelKey: string }[] = [
  { key: 'all', labelKey: 'template.category.all' },
  { key: 'social', labelKey: 'template.category.social' },
  { key: 'professional', labelKey: 'template.category.professional' },
  { key: 'creative', labelKey: 'template.category.creative' },
  { key: 'marketing', labelKey: 'template.category.marketing' },
];

const makeTimeline = (tracks: ProjectData['timeline']['tracks'], zoom = 1): ProjectData => ({
  version: 1,
  timeline: { tracks, zoom, scrollX: 0, snapEnabled: true },
});

const vTrack = (id: string, name: string) => ({
  id, name, type: 'video' as const, clips: [], muted: false, locked: false, height: 60, visible: true,
});
const aTrack = (id: string, name: string) => ({
  id, name, type: 'audio' as const, clips: [], muted: false, locked: false, height: 40, visible: true,
});
const mTrack = (id: string, name: string) => ({
  id, name, type: 'music' as const, clips: [], muted: false, locked: false, height: 40, visible: true,
});
const sTrack = (id: string, name: string) => ({
  id, name, type: 'sticker' as const, clips: [], muted: false, locked: false, height: 40, visible: true,
});

export const TEMPLATES: Template[] = [
  // ── Blank ──────────────────────────────────────────────────────────
  {
    id: 'blank',
    name: 'Blank Project',
    nameKey: 'template.blank.name',
    description: 'Start from scratch',
    descriptionKey: 'template.blank.description',
    category: 'blank',
    thumbnail: '📄',
    gradient: 'from-gray-700 to-gray-900',
    width: 1920,
    height: 1080,
    fps: 30,
    projectData: makeTimeline([
      vTrack('track_video_1', 'Video 1'),
      aTrack('track_audio_1', 'Audio 1'),
    ]),
  },

  // ── Social ─────────────────────────────────────────────────────────
  {
    id: 'social-vertical',
    name: 'Social Media (Vertical)',
    nameKey: 'template.socialVertical.name',
    description: '9:16 format for TikTok, Reels, Shorts',
    descriptionKey: 'template.socialVertical.description',
    category: 'social',
    thumbnail: '📱',
    gradient: 'from-pink-600 to-purple-700',
    width: 1080,
    height: 1920,
    fps: 30,
    projectData: makeTimeline([
      vTrack('track_main', 'Main Video'),
      sTrack('track_overlay', 'Overlay'),
      mTrack('track_music', 'Music'),
    ]),
  },
  {
    id: 'instagram-story',
    name: 'Instagram Story',
    nameKey: 'template.instagramStory.name',
    description: '9:16 vertical story format',
    descriptionKey: 'template.instagramStory.description',
    category: 'social',
    thumbnail: '📸',
    gradient: 'from-orange-500 to-pink-600',
    width: 1080,
    height: 1920,
    fps: 30,
    projectData: makeTimeline([
      vTrack('track_story', 'Story'),
      sTrack('track_stickers', 'Stickers'),
      mTrack('track_music', 'Music'),
    ]),
  },
  {
    id: 'tiktok',
    name: 'TikTok Video',
    nameKey: 'template.tiktok.name',
    description: 'Short-form vertical video',
    descriptionKey: 'template.tiktok.description',
    category: 'social',
    thumbnail: '🎵',
    gradient: 'from-cyan-500 to-pink-500',
    width: 1080,
    height: 1920,
    fps: 30,
    projectData: makeTimeline([
      vTrack('track_main', 'Main'),
      sTrack('track_text', 'Text Overlay'),
      mTrack('track_sound', 'Sound'),
    ], 2),
  },
  {
    id: 'youtube-shorts',
    name: 'YouTube Shorts',
    nameKey: 'template.youtubeShorts.name',
    description: '9:16 vertical at 60fps',
    descriptionKey: 'template.youtubeShorts.description',
    category: 'social',
    thumbnail: '▶️',
    gradient: 'from-red-600 to-red-800',
    width: 1080,
    height: 1920,
    fps: 60,
    projectData: makeTimeline([
      vTrack('track_main', 'Main'),
      sTrack('track_overlay', 'Overlay'),
      mTrack('track_music', 'Music'),
    ], 2),
  },
  {
    id: 'instagram-reels',
    name: 'Instagram Reels',
    nameKey: 'template.instagramReels.name',
    description: 'Reels 9:16 format',
    descriptionKey: 'template.instagramReels.description',
    category: 'social',
    thumbnail: '🎞️',
    gradient: 'from-purple-500 to-orange-500',
    width: 1080,
    height: 1920,
    fps: 30,
    projectData: makeTimeline([
      vTrack('track_reel', 'Reel'),
      sTrack('track_effects', 'Effects'),
      mTrack('track_audio', 'Audio'),
    ]),
  },

  // ── Professional ───────────────────────────────────────────────────
  {
    id: 'corporate-presentation',
    name: 'Corporate Presentation',
    nameKey: 'template.corporatePresentation.name',
    description: 'Professional slides with voiceover',
    descriptionKey: 'template.corporatePresentation.description',
    category: 'professional',
    thumbnail: '💼',
    gradient: 'from-blue-800 to-indigo-900',
    width: 1920,
    height: 1080,
    fps: 30,
    projectData: makeTimeline([
      vTrack('track_slides', 'Slides'),
      sTrack('track_titles', 'Titles'),
      aTrack('track_voiceover', 'Voiceover'),
      mTrack('track_bgm', 'Background Music'),
    ]),
  },
  {
    id: 'news-lower-third',
    name: 'News Lower Third',
    nameKey: 'template.newsLowerThird.name',
    description: 'News-style layout with lower-third graphics',
    descriptionKey: 'template.newsLowerThird.description',
    category: 'professional',
    thumbnail: '📺',
    gradient: 'from-slate-700 to-blue-900',
    width: 1920,
    height: 1080,
    fps: 30,
    projectData: makeTimeline([
      vTrack('track_footage', 'Footage'),
      sTrack('track_lower_third', 'Lower Third'),
      aTrack('track_audio', 'Audio'),
    ]),
  },
  {
    id: 'interview',
    name: 'Interview',
    nameKey: 'template.interview.name',
    description: 'Two-camera interview setup',
    descriptionKey: 'template.interview.description',
    category: 'professional',
    thumbnail: '🎙️',
    gradient: 'from-gray-800 to-emerald-900',
    width: 1920,
    height: 1080,
    fps: 30,
    projectData: makeTimeline([
      vTrack('track_cam_a', 'Camera A'),
      vTrack('track_cam_b', 'Camera B'),
      sTrack('track_titles', 'Name Titles'),
      aTrack('track_audio', 'Interview Audio'),
    ]),
  },

  // ── Creative ───────────────────────────────────────────────────────
  {
    id: 'youtube-intro',
    name: 'YouTube Intro',
    nameKey: 'template.youtubeIntro.name',
    description: '5-10 second intro with logo placeholder',
    descriptionKey: 'template.youtubeIntro.description',
    category: 'creative',
    thumbnail: '🎬',
    gradient: 'from-red-700 to-yellow-600',
    width: 1920,
    height: 1080,
    fps: 30,
    projectData: makeTimeline([
      vTrack('track_logo', 'Logo'),
      vTrack('track_background', 'Background'),
      mTrack('track_intro_music', 'Intro Music'),
    ], 2),
  },
  {
    id: 'slideshow',
    name: 'Photo Slideshow',
    nameKey: 'template.slideshow.name',
    description: 'Photo montage with background music',
    descriptionKey: 'template.slideshow.description',
    category: 'creative',
    thumbnail: '🖼️',
    gradient: 'from-amber-600 to-rose-700',
    width: 1920,
    height: 1080,
    fps: 30,
    projectData: makeTimeline([
      vTrack('track_photos', 'Photos'),
      mTrack('track_music', 'Background Music'),
    ], 0.5),
  },
  {
    id: 'vlog',
    name: 'Vlog',
    nameKey: 'template.vlog.name',
    description: 'Personal vlog with b-roll',
    descriptionKey: 'template.vlog.description',
    category: 'creative',
    thumbnail: '🎥',
    gradient: 'from-teal-600 to-cyan-700',
    width: 1920,
    height: 1080,
    fps: 30,
    projectData: makeTimeline([
      vTrack('track_main', 'Main Footage'),
      vTrack('track_broll', 'B-Roll'),
      sTrack('track_text', 'Text'),
      mTrack('track_music', 'Music'),
    ]),
  },
  {
    id: 'travel-montage',
    name: 'Travel Montage',
    nameKey: 'template.travelMontage.name',
    description: 'Cinematic travel video',
    descriptionKey: 'template.travelMontage.description',
    category: 'creative',
    thumbnail: '✈️',
    gradient: 'from-sky-600 to-indigo-700',
    width: 1920,
    height: 1080,
    fps: 30,
    projectData: makeTimeline([
      vTrack('track_clips', 'Travel Clips'),
      sTrack('track_titles', 'Location Titles'),
      mTrack('track_music', 'Cinematic Music'),
    ], 0.5),
  },
  {
    id: 'recipe-video',
    name: 'Recipe Video',
    nameKey: 'template.recipeVideo.name',
    description: 'Square format recipe video',
    descriptionKey: 'template.recipeVideo.description',
    category: 'creative',
    thumbnail: '🍳',
    gradient: 'from-orange-500 to-red-600',
    width: 1080,
    height: 1080,
    fps: 30,
    projectData: makeTimeline([
      vTrack('track_cooking', 'Cooking Footage'),
      sTrack('track_instructions', 'Instructions'),
      mTrack('track_music', 'Background Music'),
    ]),
  },
  {
    id: 'tutorial',
    name: 'Tutorial',
    nameKey: 'template.tutorial.name',
    description: 'Screen recording + webcam tutorial',
    descriptionKey: 'template.tutorial.description',
    category: 'creative',
    thumbnail: '📚',
    gradient: 'from-violet-600 to-purple-800',
    width: 1920,
    height: 1080,
    fps: 30,
    projectData: makeTimeline([
      vTrack('track_screen', 'Screen Recording'),
      vTrack('track_webcam', 'Webcam'),
      sTrack('track_annotations', 'Annotations'),
      aTrack('track_narration', 'Narration'),
    ]),
  },

  // ── Marketing ──────────────────────────────────────────────────────
  {
    id: 'product-demo',
    name: 'Product Demo',
    nameKey: 'template.productDemo.name',
    description: 'Multi-scene product showcase',
    descriptionKey: 'template.productDemo.description',
    category: 'marketing',
    thumbnail: '🎯',
    gradient: 'from-emerald-600 to-teal-800',
    width: 1920,
    height: 1080,
    fps: 30,
    projectData: makeTimeline([
      vTrack('track_product', 'Product Shots'),
      vTrack('track_broll', 'B-Roll'),
      sTrack('track_text', 'Text Overlays'),
      aTrack('track_voiceover', 'Voiceover'),
      mTrack('track_bgm', 'Background Music'),
    ], 0.5),
  },
  {
    id: 'product-launch',
    name: 'Product Launch',
    nameKey: 'template.productLaunch.name',
    description: 'Dramatic product reveal video',
    descriptionKey: 'template.productLaunch.description',
    category: 'marketing',
    thumbnail: '🚀',
    gradient: 'from-yellow-500 to-orange-700',
    width: 1920,
    height: 1080,
    fps: 30,
    projectData: makeTimeline([
      vTrack('track_hero', 'Hero Shot'),
      vTrack('track_features', 'Feature Shots'),
      sTrack('track_text', 'Text & CTA'),
      mTrack('track_music', 'Epic Music'),
    ]),
  },
  {
    id: 'testimonial',
    name: 'Testimonial',
    nameKey: 'template.testimonial.name',
    description: 'Customer testimonial video',
    descriptionKey: 'template.testimonial.description',
    category: 'marketing',
    thumbnail: '💬',
    gradient: 'from-green-600 to-emerald-800',
    width: 1920,
    height: 1080,
    fps: 30,
    projectData: makeTimeline([
      vTrack('track_interview', 'Interview'),
      sTrack('track_quotes', 'Quote Cards'),
      sTrack('track_branding', 'Branding'),
      mTrack('track_music', 'Soft Music'),
    ]),
  },
  {
    id: 'before-after',
    name: 'Before & After',
    nameKey: 'template.beforeAfter.name',
    description: 'Side-by-side comparison video',
    descriptionKey: 'template.beforeAfter.description',
    category: 'marketing',
    thumbnail: '🔄',
    gradient: 'from-rose-600 to-pink-800',
    width: 1920,
    height: 1080,
    fps: 30,
    projectData: makeTimeline([
      vTrack('track_before', 'Before'),
      vTrack('track_after', 'After'),
      sTrack('track_labels', 'Labels'),
      mTrack('track_music', 'Music'),
    ]),
  },
];
