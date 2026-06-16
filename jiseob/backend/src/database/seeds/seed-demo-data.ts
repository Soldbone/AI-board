import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { EntityManager } from 'typeorm';
import { CommentAnalysis } from '../../ai/comment-analysis/entities/comment-analysis.entity';
import { RagEvidence } from '../../ai/rag/entities/rag-evidence.entity';
import { AiSummary } from '../../ai/summary/entities/ai-summary.entity';
import {
  AiAnalysisStatus,
  CommentType,
  RagStatus,
  SummaryStatus,
  SummaryTargetType,
} from '../../common/enums/ai-status.enum';
import { ModerationStatus } from '../../common/enums/comment-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  EmbeddingStatus,
  MetadataStatus,
  TranscriptStatus,
} from '../../common/enums/video-status.enum';
import { Comment } from '../../comments/entities/comment.entity';
import { PostLike } from '../../posts/entities/post-like.entity';
import { PostTag } from '../../posts/entities/post-tag.entity';
import { Post } from '../../posts/entities/post.entity';
import { Tag } from '../../tags/entities/tag.entity';
import { User } from '../../users/entities/user.entity';
import { Video } from '../../videos/entities/video.entity';
import dataSource from '../typeorm.config';

const DEMO_PASSWORD = 'password123';
const DEMO_ID_PREFIX = '01DEMOSEED';
const DEMO_CHUNK_INDEX_OFFSET = 9000;

type UserKey =
  | 'admin'
  | 'minji'
  | 'jaehyun'
  | 'sora'
  | 'dongwook'
  | 'hyejin'
  | 'taeho'
  | 'yuna'
  | 'seungmin'
  | 'arin'
  | 'junseo';

type VideoKey = 'seat' | 'classroom' | 'noKids' | 'honestyStore' | 'juvenile';
type PostKey = VideoKey;
type ChunkKey = `${VideoKey}-${number}`;

type DemoUserSeed = {
  id: string;
  key: UserKey;
  email: string;
  nickname: string;
  role: UserRole;
};

type DemoVideoSeed = {
  id: string;
  key: VideoKey;
  youtubeVideoId: string;
  youtubeUrl: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  description: string;
  youtubeViewCount: number;
  youtubeLikeCount: number;
  youtubeCommentCount: number;
  metadataStatus: MetadataStatus;
  transcriptStatus: TranscriptStatus;
  embeddingStatus: EmbeddingStatus;
  transcriptErrorCode?: string | null;
  transcriptErrorMessage?: string | null;
  embeddingErrorCode?: string | null;
  embeddingErrorMessage?: string | null;
};

type DemoPostSeed = {
  id: string;
  key: PostKey;
  authorKey: UserKey;
  title: string;
  content: string;
  tags: string[];
  viewCount: number;
};

type EvidenceSeed = {
  id: string;
  chunkKey: ChunkKey;
  evidenceText: string;
  similarityScore: number;
};

type DemoCommentSeed = {
  id: string;
  postKey: PostKey;
  authorKey: UserKey;
  parentCommentId: string | null;
  content: string;
  moderationStatus: ModerationStatus;
  commentType: CommentType | null;
  aiAnalysisStatus: AiAnalysisStatus;
  ragStatus: RagStatus;
  evidences: EvidenceSeed[];
  errorCode?: string | null;
  errorMessage?: string | null;
  ragErrorCode?: string | null;
  ragErrorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type DemoChunkSeed = {
  id: string;
  key: ChunkKey;
  videoKey: VideoKey;
  chunkIndex: number;
  content: string;
  startTime: number;
  endTime: number;
};

type DemoSummarySeed = {
  id: string;
  postKey: PostKey;
  rootCommentId: string;
  createdByKey: UserKey;
  summaryText: string;
};

type DemoData = {
  comments: DemoCommentSeed[];
  summaries: DemoSummarySeed[];
};

const demoId = (index: number): string => `${DEMO_ID_PREFIX}${index.toString().padStart(16, '0')}`;

const minutesAfter = (minutes: number): Date =>
  new Date(Date.UTC(2026, 5, 16, 1, 0, 0) + minutes * 60_000);

const vectorLiteral = (dimension = 1536): string =>
  `[${Array.from({ length: dimension }, (_, index) => (index === 0 ? 1 : 0)).join(',')}]`;

const requireResolved = <T>(map: Map<string, T>, key: string): T => {
  const value = map.get(key);

  if (!value) {
    throw new Error(`Demo seed reference not found: ${key}`);
  }

  return value;
};

const users: DemoUserSeed[] = [
  {
    id: demoId(1),
    key: 'admin',
    email: 'demo-admin@arena.local',
    nickname: '관리자 데모',
    role: UserRole.ADMIN,
  },
  {
    id: demoId(11),
    key: 'minji',
    email: 'demo-minji@arena.local',
    nickname: '민지',
    role: UserRole.USER,
  },
  {
    id: demoId(12),
    key: 'jaehyun',
    email: 'demo-jaehyun@arena.local',
    nickname: '재현',
    role: UserRole.USER,
  },
  {
    id: demoId(13),
    key: 'sora',
    email: 'demo-sora@arena.local',
    nickname: '소라',
    role: UserRole.USER,
  },
  {
    id: demoId(14),
    key: 'dongwook',
    email: 'demo-dongwook@arena.local',
    nickname: '동욱',
    role: UserRole.USER,
  },
  {
    id: demoId(15),
    key: 'hyejin',
    email: 'demo-hyejin@arena.local',
    nickname: '혜진',
    role: UserRole.USER,
  },
  {
    id: demoId(16),
    key: 'taeho',
    email: 'demo-taeho@arena.local',
    nickname: '태호',
    role: UserRole.USER,
  },
  {
    id: demoId(17),
    key: 'yuna',
    email: 'demo-yuna@arena.local',
    nickname: '유나',
    role: UserRole.USER,
  },
  {
    id: demoId(18),
    key: 'seungmin',
    email: 'demo-seungmin@arena.local',
    nickname: '승민',
    role: UserRole.USER,
  },
  {
    id: demoId(19),
    key: 'arin',
    email: 'demo-arin@arena.local',
    nickname: '아린',
    role: UserRole.USER,
  },
  {
    id: demoId(20),
    key: 'junseo',
    email: 'demo-junseo@arena.local',
    nickname: '준서',
    role: UserRole.USER,
  },
];

const videos: DemoVideoSeed[] = [
  {
    id: demoId(101),
    key: 'seat',
    youtubeVideoId: 'YniWCVDmsts',
    youtubeUrl: 'https://www.youtube.com/watch?v=YniWCVDmsts',
    title: "'반말·욕설 난무' 뒤로 젖힌 의자 등받이 때문에?…역무원의 제지로 마무리 / JTBC 사건반장",
    channelName: 'JTBC News',
    thumbnailUrl: 'https://i.ytimg.com/vi/YniWCVDmsts/hqdefault.jpg',
    description:
      '열차 좌석 등받이 조절을 둘러싼 승객 간 갈등을 계기로 공공장소 예절과 권리의 경계를 토론하는 데모 영상입니다.',
    youtubeViewCount: 182_300,
    youtubeLikeCount: 1_940,
    youtubeCommentCount: 612,
    metadataStatus: MetadataStatus.SUCCESS,
    transcriptStatus: TranscriptStatus.SUCCESS,
    embeddingStatus: EmbeddingStatus.SUCCESS,
  },
  {
    id: demoId(102),
    key: 'classroom',
    youtubeVideoId: 'gs538ksckxw',
    youtubeUrl: 'https://www.youtube.com/watch?v=gs538ksckxw',
    title: '‘교실 월드컵 시청’ 교사 색출 논란 / 채널A / 뉴스A',
    channelName: '채널A News',
    thumbnailUrl: 'https://i.ytimg.com/vi/gs538ksckxw/hqdefault.jpg',
    description:
      '수업 시간 월드컵 시청과 교사 책임을 둘러싼 논란을 바탕으로 학교 현장의 재량과 절차를 토론하는 데모 영상입니다.',
    youtubeViewCount: 96_700,
    youtubeLikeCount: 870,
    youtubeCommentCount: 354,
    metadataStatus: MetadataStatus.SUCCESS,
    transcriptStatus: TranscriptStatus.SUCCESS,
    embeddingStatus: EmbeddingStatus.SUCCESS,
  },
  {
    id: demoId(103),
    key: 'noKids',
    youtubeVideoId: 'EqudTbiVjaY',
    youtubeUrl: 'https://www.youtube.com/watch?v=EqudTbiVjaY',
    title: `"'노키즈존' 안내했더니 "얘는 키즈 아닌 베이비" [뉴스YAP!] #shorts / YTN"`,
    channelName: 'YTN',
    thumbnailUrl: 'https://i.ytimg.com/vi/EqudTbiVjaY/hqdefault.jpg',
    description:
      '노키즈존을 둘러싼 영업 자유, 보호자 책임, 아동 차별 논쟁을 균형 있게 다루기 위한 데모 영상입니다.',
    youtubeViewCount: 234_000,
    youtubeLikeCount: 2_760,
    youtubeCommentCount: 1_120,
    metadataStatus: MetadataStatus.SUCCESS,
    transcriptStatus: TranscriptStatus.SUCCESS,
    embeddingStatus: EmbeddingStatus.SUCCESS,
  },
  {
    id: demoId(104),
    key: 'honestyStore',
    youtubeVideoId: 'edZ4ysAE22Y',
    youtubeUrl: 'https://www.youtube.com/watch?v=edZ4ysAE22Y',
    title: `"죄송합니다" 무인점포 점주 울린 초등학생 쪽지 (자막뉴스) / SBS`,
    channelName: 'SBS 뉴스',
    thumbnailUrl: 'https://i.ytimg.com/vi/edZ4ysAE22Y/hqdefault.jpg',
    description:
      '무인점포에서의 정직한 행동과 보호자의 교육 책임을 이야기하기 위한 데모 영상입니다.',
    youtubeViewCount: 141_900,
    youtubeLikeCount: 2_130,
    youtubeCommentCount: 428,
    metadataStatus: MetadataStatus.SUCCESS,
    transcriptStatus: TranscriptStatus.SUCCESS,
    embeddingStatus: EmbeddingStatus.FAILED,
    embeddingErrorCode: 'DEMO_EMBEDDING_FAILED',
    embeddingErrorMessage: '데모용으로 임베딩 실패 상태를 표시합니다.',
  },
  {
    id: demoId(105),
    key: 'juvenile',
    youtubeVideoId: '31wlRI89jS4',
    youtubeUrl: 'https://www.youtube.com/watch?v=31wlRI89jS4',
    title: '문방구 아수라장 만들고도…형사처벌 피한 ‘촉법소년들’ / 채널A / 뉴스A 라이브',
    channelName: '채널A News',
    thumbnailUrl: 'https://i.ytimg.com/vi/31wlRI89jS4/hqdefault.jpg',
    description: '청소년 책임, 보호처분, 회복적 교육의 균형을 토론하기 위한 데모 영상입니다.',
    youtubeViewCount: 318_400,
    youtubeLikeCount: 3_420,
    youtubeCommentCount: 1_840,
    metadataStatus: MetadataStatus.SUCCESS,
    transcriptStatus: TranscriptStatus.NOT_AVAILABLE,
    embeddingStatus: EmbeddingStatus.FAILED,
    transcriptErrorCode: 'DEMO_TRANSCRIPT_NOT_AVAILABLE',
    transcriptErrorMessage: '데모용으로 자막 없음 상태를 표시합니다.',
    embeddingErrorCode: 'DEMO_TRANSCRIPT_REQUIRED',
    embeddingErrorMessage: '자막이 없어 임베딩을 생성하지 못한 데모 상태입니다.',
  },
];

const posts: DemoPostSeed[] = [
  {
    id: demoId(201),
    key: 'seat',
    authorKey: 'minji',
    title: '열차 좌석 등받이, 권리일까 배려의 문제일까?',
    content:
      '좌석 등받이는 승객이 사용할 수 있는 기능이지만 뒤 사람의 공간도 함께 쓰는 공공장소라는 점에서 의견이 갈립니다. 영상 속 상황처럼 말투가 거칠어지기 전에 어떤 기준이 필요할까요?',
    tags: ['뉴스', '도덕', '생활예절', '대중교통'],
    viewCount: 1286,
  },
  {
    id: demoId(202),
    key: 'classroom',
    authorKey: 'jaehyun',
    title: '교실 월드컵 시청 논란, 교사의 재량은 어디까지일까?',
    content:
      '학생들의 관심사를 교육적으로 다룰 수도 있지만 정규 수업 시간과 학습권을 생각하면 절차가 필요하다는 의견도 있습니다. 교사를 색출하는 방식이 적절했는지도 함께 이야기해봅시다.',
    tags: ['뉴스', '교육', '학교', '책임'],
    viewCount: 944,
  },
  {
    id: demoId(203),
    key: 'noKids',
    authorKey: 'sora',
    title: '노키즈존은 차별일까, 업장의 자율일까?',
    content:
      '아이와 보호자를 무조건 배제하는 표현은 불편하지만, 영업장 입장에서는 반복되는 피해를 관리해야 한다는 주장도 있습니다. 규칙이 있다면 어떤 방식이 덜 배제적일까요?',
    tags: ['뉴스', '도덕', '노키즈존', '자영업'],
    viewCount: 1733,
  },
  {
    id: demoId(204),
    key: 'honestyStore',
    authorKey: 'hyejin',
    title: '무인점포에서 남긴 사과 쪽지, 우리는 무엇을 칭찬해야 할까?',
    content:
      '실수를 인정하고 바로잡으려는 태도는 칭찬받을 만합니다. 동시에 무인점포가 아이들에게 어떤 책임감을 요구하는 공간인지, 보호자는 어디까지 도와야 하는지도 생각해볼 수 있습니다.',
    tags: ['뉴스', '양심', '무인점포', '교육'],
    viewCount: 812,
  },
  {
    id: demoId(205),
    key: 'juvenile',
    authorKey: 'taeho',
    title: '촉법소년 논란, 처벌 강화만으로 충분할까?',
    content:
      '피해 회복이 가장 먼저라는 점에는 많은 사람이 동의합니다. 다만 처벌 연령을 낮추는 것과 재발 방지 교육을 강화하는 것 중 무엇이 실제로 효과적인지는 차분히 따져볼 필요가 있습니다.',
    tags: ['뉴스', '청소년', '법', '회복'],
    viewCount: 2194,
  },
];

const chunks: DemoChunkSeed[] = [
  {
    id: demoId(301),
    key: 'seat-0',
    videoKey: 'seat',
    chunkIndex: DEMO_CHUNK_INDEX_OFFSET,
    content:
      '영상에서는 열차 좌석 등받이를 뒤로 젖힌 문제로 승객 사이 언쟁이 벌어졌고 역무원이 제지해 상황이 마무리됐다고 설명한다.',
    startTime: 8,
    endTime: 34,
  },
  {
    id: demoId(302),
    key: 'seat-1',
    videoKey: 'seat',
    chunkIndex: DEMO_CHUNK_INDEX_OFFSET + 1,
    content:
      '제보자는 반말과 거친 표현이 오가면서 주변 승객도 불편을 겪었다고 전했고, 공공장소 예절 문제가 쟁점으로 소개됐다.',
    startTime: 35,
    endTime: 66,
  },
  {
    id: demoId(303),
    key: 'classroom-0',
    videoKey: 'classroom',
    chunkIndex: DEMO_CHUNK_INDEX_OFFSET,
    content:
      '보도는 교실에서 월드컵 경기를 시청한 교사를 특정하려는 움직임이 논란이 됐다고 전한다.',
    startTime: 4,
    endTime: 26,
  },
  {
    id: demoId(304),
    key: 'classroom-1',
    videoKey: 'classroom',
    chunkIndex: DEMO_CHUNK_INDEX_OFFSET + 1,
    content:
      '쟁점은 수업권 침해 여부, 학교장의 승인 절차, 학생 관심사를 교육적으로 활용할 수 있는지로 나뉜다.',
    startTime: 27,
    endTime: 54,
  },
  {
    id: demoId(305),
    key: 'noKids-0',
    videoKey: 'noKids',
    chunkIndex: DEMO_CHUNK_INDEX_OFFSET,
    content:
      '노키즈존 안내를 둘러싼 갈등은 업장의 자율과 아동 동반 손님의 이용권 사이에서 의견이 갈린다고 소개된다.',
    startTime: 2,
    endTime: 22,
  },
  {
    id: demoId(306),
    key: 'noKids-1',
    videoKey: 'noKids',
    chunkIndex: DEMO_CHUNK_INDEX_OFFSET + 1,
    content:
      '일부 업장은 안전사고와 반복 민원을 이유로 제한을 두지만, 아이를 이유로 한 일괄 배제는 차별이라는 반론도 나온다.',
    startTime: 23,
    endTime: 45,
  },
  {
    id: demoId(307),
    key: 'honestyStore-0',
    videoKey: 'honestyStore',
    chunkIndex: DEMO_CHUNK_INDEX_OFFSET,
    content:
      '무인점포에서 초등학생이 실수 뒤 사과 쪽지를 남긴 사연이 전해졌고, 점주는 정직한 태도에 고마움을 표현했다.',
    startTime: 5,
    endTime: 29,
  },
];

const postLikes: Array<{ postKey: PostKey; userKeys: UserKey[] }> = [
  { postKey: 'seat', userKeys: ['jaehyun', 'sora', 'hyejin', 'taeho', 'arin'] },
  { postKey: 'classroom', userKeys: ['minji', 'dongwook', 'yuna'] },
  { postKey: 'noKids', userKeys: ['jaehyun', 'hyejin', 'seungmin', 'junseo'] },
  { postKey: 'honestyStore', userKeys: ['minji', 'sora', 'arin'] },
  { postKey: 'juvenile', userKeys: ['dongwook', 'hyejin', 'taeho', 'yuna', 'seungmin'] },
];

const createDemoComments = (): DemoData => {
  const comments: DemoCommentSeed[] = [];
  const summaries: DemoSummarySeed[] = [];
  let nextCommentIndex = 1001;
  let nextEvidenceIndex = 4001;

  const addComment = (
    input: Omit<
      DemoCommentSeed,
      'id' | 'evidences' | 'createdAt' | 'updatedAt' | 'moderationStatus'
    > & {
      moderationStatus?: ModerationStatus;
      evidences?: Omit<EvidenceSeed, 'id'>[];
    },
  ): string => {
    const id = demoId(nextCommentIndex);
    const createdAt = minutesAfter(nextCommentIndex - 1000);
    const evidences = (input.evidences ?? []).map((evidence) => ({
      ...evidence,
      id: demoId(nextEvidenceIndex++),
    }));

    comments.push({
      id,
      postKey: input.postKey,
      authorKey: input.authorKey,
      parentCommentId: input.parentCommentId,
      content: input.content,
      moderationStatus: input.moderationStatus ?? ModerationStatus.NORMAL,
      commentType: input.commentType,
      aiAnalysisStatus: input.aiAnalysisStatus,
      ragStatus: input.ragStatus,
      evidences,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      ragErrorCode: input.ragErrorCode ?? null,
      ragErrorMessage: input.ragErrorMessage ?? null,
      createdAt,
      updatedAt: new Date(createdAt.getTime() + 90_000),
    });
    nextCommentIndex += 1;

    return id;
  };

  const addSuccess = (
    postKey: PostKey,
    authorKey: UserKey,
    parentCommentId: string | null,
    content: string,
    commentType: CommentType,
    ragStatus: RagStatus,
    options: {
      moderationStatus?: ModerationStatus;
      evidences?: Omit<EvidenceSeed, 'id'>[];
      ragErrorCode?: string;
      ragErrorMessage?: string;
    } = {},
  ): string =>
    addComment({
      postKey,
      authorKey,
      parentCommentId,
      content,
      moderationStatus: options.moderationStatus,
      commentType,
      aiAnalysisStatus: AiAnalysisStatus.SUCCESS,
      ragStatus,
      evidences: options.evidences,
      ragErrorCode: options.ragErrorCode,
      ragErrorMessage: options.ragErrorMessage,
    });

  const addFailed = (
    postKey: PostKey,
    authorKey: UserKey,
    parentCommentId: string | null,
    content: string,
  ): string =>
    addComment({
      postKey,
      authorKey,
      parentCommentId,
      content,
      moderationStatus: ModerationStatus.NEEDS_REVIEW,
      commentType: null,
      aiAnalysisStatus: AiAnalysisStatus.FAILED,
      ragStatus: RagStatus.NOT_REQUIRED,
      errorCode: 'DEMO_ANALYSIS_FAILED',
      errorMessage: '데모용으로 정제된 분석 실패 상태를 표시합니다.',
    });

  const seatRoot = addSuccess(
    'seat',
    'minji',
    null,
    '등받이를 젖힐 수 있게 만든 좌석이라도 뒤 사람이 식사 중이거나 노트북을 쓰고 있으면 한마디 물어보는 게 맞다고 봅니다.',
    CommentType.OPINION,
    RagStatus.NOT_REQUIRED,
  );

  [
    [
      'jaehyun',
      '기능이 있는 이상 쓰는 건 권리지만, 공공장소에서는 권리 행사 방식도 중요하죠. 말 한마디면 싸움까지 안 갔을 것 같습니다.',
    ],
    [
      'sora',
      '저도 먼저 물어보는 쪽이 좋다고 봐요. 다만 뒤 사람이 무조건 못 하게 막는 것도 지나칩니다.',
    ],
    [
      'dongwook',
      '영상에서는 역무원이 제지해서 마무리됐다고 하던데, 결국 승무원이나 역무원이 중재 기준을 더 명확히 안내해야 할 것 같습니다.',
    ],
    [
      'hyejin',
      '등받이를 완전히 젖히는 것과 살짝 조절하는 것은 다르게 봐야 하지 않을까요? 상황별 기준이 필요해 보여요.',
    ],
    [
      'taeho',
      '서로 존댓말만 했어도 문제가 작아졌을 것 같습니다. 예절 문제에서 말투가 차지하는 비중이 큽니다.',
    ],
    [
      'yuna',
      '뒤 사람에게 물어보는 문화가 자리 잡으면 좋겠지만, 그게 법적 의무처럼 굳어지는 건 조심해야 합니다.',
    ],
    [
      'seungmin',
      '장거리 이동이면 허리 아픈 사람도 있을 수 있어서 아예 금지처럼 말하기는 어렵습니다.',
    ],
    [
      'arin',
      '그래도 식사 중인 사람 앞에서 갑자기 젖히면 음식이 쏟아질 수도 있죠. 최소한 확인은 필요합니다.',
    ],
    ['junseo', '이건 사실 누구 잘못 하나로 끝내기보다 좁은 좌석 구조도 같이 봐야 합니다.'],
    ['minji', '맞아요. 좌석 간격이 너무 좁으면 작은 행동도 갈등이 됩니다.'],
    [
      'jaehyun',
      '영상에서 반말과 거친 표현이 오갔다고 설명된 점이 핵심 같습니다. 행동보다 대응 방식이 더 문제였을 수도 있어요.',
    ],
    [
      'sora',
      '저는 항공기처럼 안내 방송으로 “천천히 조절해달라” 정도만 반복해도 효과가 있을 것 같습니다.',
    ],
    ['dongwook', '상대가 불편을 말했을 때 바로 원위치하는 게 성숙한 태도라고 생각합니다.'],
    ['hyejin', '반대로 뒤 사람이 “절대 하지 말라”고 압박하면 그것도 갈등을 키웁니다.'],
    [
      'taeho',
      '서로 한 칸씩 양보하는 식의 안내가 현실적이겠네요. 완전 금지와 무제한 사용 사이에 기준이 필요합니다.',
    ],
    ['yuna', '공공장소 예절은 결국 내가 편하자고 남을 불편하게 만들지 않는 선을 찾는 문제 같아요.'],
    ['seungmin', '아이 동반이나 노약자가 뒤에 있으면 더 조심해야 한다는 의견도 이해됩니다.'],
    [
      'arin',
      '다만 상황을 보지 않고 “젖힌 사람이 무조건 잘못”이라고 단정하는 댓글은 너무 단순합니다.',
    ],
    ['junseo', '이런 논쟁은 실제로 좌석 설계와 안내 문구를 바꾸는 쪽으로 이어지면 좋겠습니다.'],
    [
      'sora',
      '상대에게 무식하다고 단정하는 식의 표현은 선을 넘었다고 봅니다. 비판은 하되 사람을 깎아내리면 안 됩니다.',
    ],
    [
      'dongwook',
      '정리하면 먼저 묻기, 천천히 조절하기, 불편 제기하면 대화하기 정도가 최소 기준 아닐까요?',
    ],
    [
      'hyejin',
      '그 정도면 대부분의 상황에서 납득할 수 있을 것 같습니다. 결국 기준보다 태도가 먼저네요.',
    ],
  ].forEach(([authorKey, content], index) => {
    addSuccess(
      'seat',
      authorKey as UserKey,
      seatRoot,
      content,
      index === 2 || index === 10 ? CommentType.FACT_CLAIM : CommentType.OPINION,
      index === 2 ? RagStatus.SUCCESS : index === 10 ? RagStatus.SUCCESS : RagStatus.NOT_REQUIRED,
      index === 2
        ? {
            evidences: [
              {
                chunkKey: 'seat-0',
                evidenceText:
                  '영상에서는 열차 좌석 등받이를 둘러싼 언쟁이 역무원 제지로 마무리됐다고 설명한다.',
                similarityScore: 0.86,
              },
            ],
          }
        : index === 10
          ? {
              evidences: [
                {
                  chunkKey: 'seat-1',
                  evidenceText:
                    '반말과 거친 표현이 오가며 주변 승객도 불편을 겪었다는 제보 내용이 소개됐다.',
                  similarityScore: 0.81,
                },
              ],
            }
          : index === 19
            ? { moderationStatus: ModerationStatus.NEEDS_REVIEW }
            : {},
    );
  });

  summaries.push({
    id: demoId(5001),
    postKey: 'seat',
    rootCommentId: seatRoot,
    createdByKey: 'admin',
    summaryText:
      '핵심 요약\n- 좌석 등받이 조절은 승객의 권리라는 입장과 뒤 사람을 배려해야 한다는 입장이 맞섭니다.\n\n주요 쟁점\n- 갑작스러운 조절, 말투, 좁은 좌석 구조, 안내 기준 부족이 갈등 원인으로 언급됩니다.\n\n서로 다른 입장\n- 완전 금지보다 먼저 묻기와 천천히 조절하기 같은 절충 기준이 필요하다는 의견이 많습니다.\n\n확인 한계\n- 이 요약은 데모 seed의 합성 댓글을 바탕으로 한 예시입니다.',
  });

  const classroomRoot = addSuccess(
    'classroom',
    'jaehyun',
    null,
    '월드컵을 교실에서 봤다는 사실보다, 그 뒤에 교사를 색출하듯 찾는 방식이 더 걱정됩니다. 절차가 있어야죠.',
    CommentType.OPINION,
    RagStatus.NOT_REQUIRED,
  );

  [
    ['minji', '수업 시간이라면 원칙적으로 학습권을 먼저 봐야 한다는 의견도 이해됩니다.'],
    [
      'sora',
      '다만 월드컵 같은 사회적 이벤트를 계기로 토론 수업을 할 수도 있으니 무조건 일탈로만 보기는 어렵습니다.',
    ],
    [
      'dongwook',
      '보도에서는 교사를 특정하려는 움직임이 논란이었다고 설명합니다. 문제 제기도 방식이 중요하죠.',
    ],
    ['hyejin', '학교장 승인이나 대체 과제 같은 절차가 있었다면 논란이 훨씬 줄었을 것 같습니다.'],
    ['taeho', '학생들이 원해서 봤더라도 교사는 수업 책임자라서 기록은 남겼어야 한다고 봅니다.'],
    [
      'yuna',
      '교사 한 명을 희생양으로 만드는 방식은 교육적이지 않습니다. 제도 개선으로 가야 합니다.',
    ],
    ['seungmin', '학부모가 문제를 제기할 수는 있지만, 공개적으로 몰아가는 분위기는 위험합니다.'],
    ['arin', '아이들 입장에서는 특별한 경험이었을 수도 있어서 결과만 놓고 판단하기 어렵네요.'],
    ['junseo', '교육청 기준이 모호하면 현장 교사만 부담을 떠안습니다.'],
    ['minji', '수업권 침해 여부와 교사 색출 문제는 나눠서 봐야 합니다. 둘 다 중요해요.'],
    ['dongwook', '영상의 쟁점도 승인 절차와 교사 재량 사이에 있는 것 같습니다.'],
    ['sora', '교사를 무조건 비난하는 댓글은 불편합니다. 현장 맥락도 확인해야 합니다.'],
    ['hyejin', '반대로 “재미있었으면 됐다”로 끝내기에도 학교는 공적 공간이라 기준이 필요합니다.'],
    ['taeho', '다음에는 사전에 안내하고 희망자만 별도 활동으로 하는 식이면 좋겠네요.'],
  ].forEach(([authorKey, content], index) => {
    addSuccess(
      'classroom',
      authorKey as UserKey,
      classroomRoot,
      content,
      index === 2 || index === 10 ? CommentType.FACT_CLAIM : CommentType.OPINION,
      index === 2 ? RagStatus.SUCCESS : index === 10 ? RagStatus.SUCCESS : RagStatus.NOT_REQUIRED,
      index === 2
        ? {
            evidences: [
              {
                chunkKey: 'classroom-0',
                evidenceText:
                  '보도는 교실에서 월드컵 경기를 시청한 교사를 특정하려는 움직임이 논란이 됐다고 전한다.',
                similarityScore: 0.84,
              },
            ],
          }
        : index === 10
          ? {
              evidences: [
                {
                  chunkKey: 'classroom-1',
                  evidenceText:
                    '쟁점은 수업권 침해 여부와 승인 절차, 교육적 활용 가능성으로 나뉜다.',
                  similarityScore: 0.77,
                },
              ],
            }
          : {},
    );
  });

  const noKidsRoot = addSuccess(
    'noKids',
    'sora',
    null,
    '노키즈존은 업장 피해를 줄이려는 의도도 있겠지만, 아이를 동반했다는 이유만으로 일괄 배제하는 표현은 조심해야 한다고 생각합니다.',
    CommentType.OPINION,
    RagStatus.NOT_REQUIRED,
  );

  [
    [
      'jaehyun',
      '아이 자체보다 보호자의 관리 책임을 분명히 하는 규칙이면 조금 덜 배제적일 것 같습니다.',
    ],
    [
      'dongwook',
      '업장도 반복적인 안전사고나 민원이 있으면 대응책이 필요합니다. 자영업자 부담도 현실이에요.',
    ],
    ['hyejin', '노키즈존 안내를 둘러싼 갈등은 영업 자유와 이용권 사이의 문제로 소개됩니다.'],
    ['taeho', '표현을 “조용한 이용이 필요한 공간”처럼 바꾸면 낙인 느낌이 줄지 않을까요?'],
    ['yuna', '아이를 데려온 손님도 손님인데 처음부터 거절당하면 상처가 클 것 같습니다.'],
    ['seungmin', '그렇다고 피해 본 손님에게 참으라고만 할 수도 없죠. 책임 기준이 필요합니다.'],
    ['arin', '아이 탓으로만 돌리면 보호자 교육 문제를 놓칠 수 있습니다.'],
    [
      'junseo',
      '업장마다 공간 구조가 다르니 일괄 금지보다 시간대 제한 같은 선택지도 있어 보입니다.',
    ],
    [
      'minji',
      '아이 있는 가족을 싸잡아 민폐라고 부르는 건 검토가 필요한 표현입니다. 경험담과 혐오는 구분해야 합니다.',
    ],
    ['sora', '결국 배제보다 예측 가능한 규칙과 보호자 책임 안내가 핵심이겠네요.'],
  ].forEach(([authorKey, content], index) => {
    addSuccess(
      'noKids',
      authorKey as UserKey,
      noKidsRoot,
      content,
      index === 2 ? CommentType.FACT_CLAIM : CommentType.OPINION,
      index === 2 ? RagStatus.SUCCESS : RagStatus.NOT_REQUIRED,
      index === 2
        ? {
            evidences: [
              {
                chunkKey: 'noKids-0',
                evidenceText:
                  '노키즈존 안내를 둘러싼 갈등은 업장의 자율과 아동 동반 손님의 이용권 사이에서 의견이 갈린다고 소개된다.',
                similarityScore: 0.82,
              },
            ],
          }
        : index === 8
          ? { moderationStatus: ModerationStatus.NEEDS_REVIEW }
          : {},
    );
  });

  const honestyRoot = addSuccess(
    'honestyStore',
    'hyejin',
    null,
    '무인점포 사과 쪽지는 아이가 잘못을 인정하고 고치려 했다는 점에서 칭찬할 만하지만, 보호자의 역할도 같이 봐야 한다고 생각합니다.',
    CommentType.OPINION,
    RagStatus.NOT_REQUIRED,
  );

  [
    ['minji', '실수 뒤에 바로잡는 경험이 아이에게 더 큰 교육이 될 수도 있겠네요.'],
    ['jaehyun', '무인점포가 늘면서 아이들이 돈과 책임을 배우는 공간이 된 것 같습니다.'],
    ['sora', '영상에서는 초등학생이 사과 쪽지를 남겼고 점주가 고마움을 표현했다고 소개됩니다.'],
    ['dongwook', '칭찬은 하되 “아이니까 괜찮다”가 아니라 책임지는 태도를 칭찬해야 한다고 봅니다.'],
    [
      'taeho',
      '점주 입장에서는 손해가 반복되면 선의만으로 버티기 어렵습니다. 시스템 보완도 필요합니다.',
    ],
    ['yuna', '부모가 대신 해결하기보다 아이가 직접 사과하게 한 점이 좋았을 것 같아요.'],
    [
      'seungmin',
      '이런 사례가 알려지면 무인점포를 이용하는 사람들도 조금 더 조심하게 될 것 같습니다.',
    ],
  ].forEach(([authorKey, content], index) => {
    addSuccess(
      'honestyStore',
      authorKey as UserKey,
      honestyRoot,
      content,
      index === 2 ? CommentType.FACT_CLAIM : CommentType.OPINION,
      index === 2 ? RagStatus.FAILED : RagStatus.NOT_REQUIRED,
      index === 2
        ? {
            ragErrorCode: 'DEMO_RAG_EMBEDDING_FAILED',
            ragErrorMessage: '데모용으로 RAG 실패 상태를 표시합니다.',
          }
        : {},
    );
  });

  const juvenileRoot = addSuccess(
    'juvenile',
    'taeho',
    null,
    '피해자가 있는 사건에서는 회복이 먼저입니다. 다만 처벌 연령을 낮추는 것만으로 재발이 줄어드는지는 별도로 봐야 합니다.',
    CommentType.OPINION,
    RagStatus.NOT_REQUIRED,
  );

  [
    ['dongwook', '피해자 입장에서는 “어리니까 봐준다”는 말이 가장 답답할 것 같습니다.'],
    [
      'hyejin',
      '처벌 강화와 보호자 책임을 같이 논의해야 합니다. 아이만 처벌한다고 끝날 문제는 아니에요.',
    ],
    [
      'minji',
      '영상은 형사처벌을 피한 촉법소년 사례를 소개하지만, 정확한 처분 내용까지는 더 확인이 필요합니다.',
    ],
    ['sora', '재범을 막으려면 학교, 보호관찰, 지역 상담이 같이 움직여야 할 것 같습니다.'],
    ['jaehyun', '다만 피해 회복 없이 교육만 강조하면 피해자는 또 소외됩니다. 순서가 중요합니다.'],
    [
      'yuna',
      '감정적으로는 강하게 처벌하고 싶지만, 제도가 실제로 효과를 내야 한다는 점도 봐야겠네요.',
    ],
    [
      'seungmin',
      '이 사안은 자막을 찾을 수 없는 데모 영상이라 RAG 근거가 없다고 표시되는 게 맞습니다.',
    ],
    [
      'arin',
      '청소년 전체를 범죄자처럼 말하는 댓글은 선을 넘습니다. 사건과 집단은 구분해야 합니다.',
    ],
    ['junseo', '피해 회복, 재발 방지, 보호자 책임을 같이 묶어야 현실적인 대책이 될 것 같습니다.'],
  ].forEach(([authorKey, content], index) => {
    if (index === 6) {
      addFailed('juvenile', authorKey as UserKey, juvenileRoot, content);
      return;
    }

    addSuccess(
      'juvenile',
      authorKey as UserKey,
      juvenileRoot,
      content,
      index === 2 ? CommentType.FACT_CLAIM : index === 7 ? CommentType.TOXIC : CommentType.OPINION,
      index === 2 ? RagStatus.NO_RESULT : RagStatus.NOT_REQUIRED,
      index === 7 ? { moderationStatus: ModerationStatus.NEEDS_REVIEW } : {},
    );
  });

  return { comments, summaries };
};

const { comments, summaries } = createDemoComments();

const assertSeedAllowed = (): void => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run demo seed when NODE_ENV=production.');
  }
};

const ensureUsers = async (
  manager: EntityManager,
  passwordHash: string,
): Promise<Map<UserKey, string>> => {
  const repository = manager.getRepository(User);
  const resolved = new Map<UserKey, string>();

  for (const seed of users) {
    const existing = await repository.findOne({
      where: { email: seed.email },
      withDeleted: true,
    });
    const id = existing?.id ?? seed.id;
    const createdAt = existing?.createdAt ?? minutesAfter(0);

    await repository.save(
      repository.create({
        ...existing,
        id,
        email: seed.email,
        passwordHash,
        nickname: seed.nickname,
        role: seed.role,
        createdAt,
        updatedAt: minutesAfter(0),
        deletedAt: null,
      }),
    );
    resolved.set(seed.key, id);
  }

  return resolved;
};

const ensureVideos = async (manager: EntityManager): Promise<Map<VideoKey, string>> => {
  const repository = manager.getRepository(Video);
  const resolved = new Map<VideoKey, string>();

  for (const seed of videos) {
    const existing = await repository.findOne({
      where: { youtubeVideoId: seed.youtubeVideoId },
      withDeleted: true,
    });
    const id = existing?.id ?? seed.id;
    const createdAt = existing?.createdAt ?? minutesAfter(1);

    await repository.save(
      repository.create({
        ...existing,
        id,
        youtubeVideoId: seed.youtubeVideoId,
        youtubeUrl: seed.youtubeUrl,
        title: seed.title,
        channelName: seed.channelName,
        thumbnailUrl: seed.thumbnailUrl,
        publishedAt: null,
        description: seed.description,
        youtubeViewCount: seed.youtubeViewCount,
        youtubeLikeCount: seed.youtubeLikeCount,
        youtubeCommentCount: seed.youtubeCommentCount,
        metadataStatus: seed.metadataStatus,
        transcriptStatus: seed.transcriptStatus,
        embeddingStatus: seed.embeddingStatus,
        metadataErrorCode: null,
        metadataErrorMessage: null,
        transcriptErrorCode: seed.transcriptErrorCode ?? null,
        transcriptErrorMessage: seed.transcriptErrorMessage ?? null,
        embeddingErrorCode: seed.embeddingErrorCode ?? null,
        embeddingErrorMessage: seed.embeddingErrorMessage ?? null,
        processedAt: minutesAfter(2),
        processingLockedUntil: null,
        createdAt,
        updatedAt: minutesAfter(2),
        deletedAt: null,
      }),
    );
    resolved.set(seed.key, id);
  }

  return resolved;
};

const ensureTags = async (manager: EntityManager): Promise<Map<string, string>> => {
  const repository = manager.getRepository(Tag);
  const names = [...new Set(posts.flatMap((post) => post.tags))].sort((left, right) =>
    left.localeCompare(right),
  );
  const resolved = new Map<string, string>();

  for (const [index, name] of names.entries()) {
    const existing = await repository.findOne({ where: { name }, withDeleted: true });
    const id = existing?.id ?? demoId(601 + index);
    const createdAt = existing?.createdAt ?? minutesAfter(3);

    await repository.save(
      repository.create({
        ...existing,
        id,
        name,
        createdAt,
        updatedAt: minutesAfter(3),
        deletedAt: null,
      }),
    );
    resolved.set(name, id);
  }

  return resolved;
};

const ensurePosts = async (
  manager: EntityManager,
  userIds: Map<UserKey, string>,
  videoIds: Map<VideoKey, string>,
): Promise<Map<PostKey, string>> => {
  const repository = manager.getRepository(Post);
  const resolved = new Map<PostKey, string>();

  for (const [index, seed] of posts.entries()) {
    const authorId = requireResolved(userIds, seed.authorKey);
    const videoId = requireResolved(videoIds, seed.key);
    const createdAt = minutesAfter(10 + index * 12);

    await repository.save(
      repository.create({
        id: seed.id,
        authorId,
        videoId,
        title: seed.title,
        content: seed.content,
        youtubeUrl: requireResolved(
          new Map(videos.map((video) => [video.key, video.youtubeUrl])),
          seed.key,
        ),
        commentCount: 0,
        viewCount: seed.viewCount,
        likeCount: 0,
        createdAt,
        updatedAt: new Date(createdAt.getTime() + 120_000),
        deletedAt: null,
      }),
    );
    resolved.set(seed.key, seed.id);
  }

  return resolved;
};

const ensurePostTags = async (
  manager: EntityManager,
  postIds: Map<PostKey, string>,
  tagIds: Map<string, string>,
): Promise<void> => {
  const postIdValues = posts.map((post) => requireResolved(postIds, post.key));

  await manager
    .createQueryBuilder()
    .delete()
    .from(PostTag)
    .where('"post_id" IN (:...postIds)', { postIds: postIdValues })
    .execute();

  const postTags = posts.flatMap((post) =>
    post.tags.map((tagName) => ({
      postId: requireResolved(postIds, post.key),
      tagId: requireResolved(tagIds, tagName),
    })),
  );

  await manager.getRepository(PostTag).insert(postTags);
};

const ensurePostLikes = async (
  manager: EntityManager,
  postIds: Map<PostKey, string>,
  userIds: Map<UserKey, string>,
): Promise<void> => {
  const postIdValues = posts.map((post) => requireResolved(postIds, post.key));
  const userIdValues = users.map((user) => requireResolved(userIds, user.key));

  await manager
    .createQueryBuilder()
    .delete()
    .from(PostLike)
    .where('"post_id" IN (:...postIds)', { postIds: postIdValues })
    .andWhere('"user_id" IN (:...userIds)', { userIds: userIdValues })
    .execute();

  const likes = postLikes.flatMap((postLike) =>
    postLike.userKeys.map((userKey) => ({
      postId: requireResolved(postIds, postLike.postKey),
      userId: requireResolved(userIds, userKey),
      createdAt: minutesAfter(80),
    })),
  );

  await manager.getRepository(PostLike).insert(likes);
};

const ensureTranscriptChunks = async (
  manager: EntityManager,
  videoIds: Map<VideoKey, string>,
): Promise<Map<ChunkKey, string>> => {
  const resolved = new Map<ChunkKey, string>();
  const embedding = vectorLiteral();

  for (const seed of chunks) {
    await manager.query(
      `
        INSERT INTO "transcript_chunks" (
          "id",
          "created_at",
          "updated_at",
          "deleted_at",
          "video_id",
          "chunk_index",
          "content",
          "start_time",
          "end_time",
          "embedding"
        )
        VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $9::vector)
        ON CONFLICT ("id") DO UPDATE SET
          "updated_at" = EXCLUDED."updated_at",
          "deleted_at" = NULL,
          "video_id" = EXCLUDED."video_id",
          "chunk_index" = EXCLUDED."chunk_index",
          "content" = EXCLUDED."content",
          "start_time" = EXCLUDED."start_time",
          "end_time" = EXCLUDED."end_time",
          "embedding" = EXCLUDED."embedding"
      `,
      [
        seed.id,
        minutesAfter(4),
        minutesAfter(4),
        requireResolved(videoIds, seed.videoKey),
        seed.chunkIndex,
        seed.content,
        seed.startTime,
        seed.endTime,
        embedding,
      ],
    );
    resolved.set(seed.key, seed.id);
  }

  return resolved;
};

const ensureComments = async (
  manager: EntityManager,
  postIds: Map<PostKey, string>,
  userIds: Map<UserKey, string>,
): Promise<void> => {
  const repository = manager.getRepository(Comment);
  const roots = comments.filter((comment) => comment.parentCommentId === null);
  const replies = comments.filter((comment) => comment.parentCommentId !== null);

  for (const seed of [...roots, ...replies]) {
    await repository.save(
      repository.create({
        id: seed.id,
        postId: requireResolved(postIds, seed.postKey),
        authorId: requireResolved(userIds, seed.authorKey),
        parentCommentId: seed.parentCommentId,
        content: seed.content,
        moderationStatus: seed.moderationStatus,
        createdAt: seed.createdAt,
        updatedAt: seed.updatedAt,
        deletedAt: null,
      }),
    );
  }
};

const ensureCommentAnalyses = async (manager: EntityManager): Promise<void> => {
  const repository = manager.getRepository(CommentAnalysis);

  for (const [index, seed] of comments.entries()) {
    await repository.save(
      repository.create({
        id: demoId(2001 + index),
        commentId: seed.id,
        commentType: seed.commentType,
        aiAnalysisStatus: seed.aiAnalysisStatus,
        ragStatus: seed.ragStatus,
        evidenceCount: seed.evidences.length,
        analyzedAt:
          seed.aiAnalysisStatus === AiAnalysisStatus.PENDING
            ? null
            : new Date(seed.updatedAt.getTime() + 60_000),
        errorCode: seed.errorCode ?? null,
        errorMessage: seed.errorMessage ?? null,
        ragErrorCode: seed.ragErrorCode ?? null,
        ragErrorMessage: seed.ragErrorMessage ?? null,
        createdAt: seed.createdAt,
        updatedAt: new Date(seed.updatedAt.getTime() + 60_000),
        deletedAt: null,
      }),
    );
  }
};

const ensureRagEvidences = async (
  manager: EntityManager,
  chunkIds: Map<ChunkKey, string>,
): Promise<void> => {
  const repository = manager.getRepository(RagEvidence);
  const evidenceSeeds = comments.flatMap((comment) =>
    comment.evidences.map((evidence) => ({
      ...evidence,
      commentId: comment.id,
      createdAt: comment.updatedAt,
    })),
  );

  for (const seed of evidenceSeeds) {
    await repository.save(
      repository.create({
        id: seed.id,
        commentId: seed.commentId,
        transcriptChunkId: requireResolved(chunkIds, seed.chunkKey),
        evidenceText: seed.evidenceText,
        similarityScore: seed.similarityScore,
        createdAt: seed.createdAt,
        updatedAt: seed.createdAt,
        deletedAt: null,
      }),
    );
  }
};

const ensureSummaries = async (
  manager: EntityManager,
  postIds: Map<PostKey, string>,
  userIds: Map<UserKey, string>,
): Promise<void> => {
  const repository = manager.getRepository(AiSummary);

  for (const seed of summaries) {
    const threadComments = comments.filter(
      (comment) =>
        comment.id === seed.rootCommentId || comment.parentCommentId === seed.rootCommentId,
    );
    const lastComment = threadComments.at(-1);
    const lastUpdatedAt =
      threadComments.reduce<Date | null>((latest, comment) => {
        if (!latest || comment.updatedAt.getTime() > latest.getTime()) {
          return comment.updatedAt;
        }

        return latest;
      }, null) ?? null;
    const generatedAt = lastUpdatedAt
      ? new Date(lastUpdatedAt.getTime() + 120_000)
      : minutesAfter(90);

    await repository.save(
      repository.create({
        id: seed.id,
        targetType: SummaryTargetType.COMMENT_THREAD,
        postId: requireResolved(postIds, seed.postKey),
        rootCommentId: seed.rootCommentId,
        createdById: requireResolved(userIds, seed.createdByKey),
        summaryText: seed.summaryText,
        summaryStatus: SummaryStatus.SUCCESS,
        summarizedCommentCount: threadComments.length,
        lastCommentId: lastComment?.id ?? null,
        lastCommentUpdatedAt: lastUpdatedAt,
        errorCode: null,
        errorMessage: null,
        generatedAt,
        createdAt: generatedAt,
        updatedAt: generatedAt,
        deletedAt: null,
      }),
    );
  }
};

const refreshPostCounters = async (
  manager: EntityManager,
  postIds: Map<PostKey, string>,
): Promise<void> => {
  const postRepository = manager.getRepository(Post);
  const commentRepository = manager.getRepository(Comment);
  const likeRepository = manager.getRepository(PostLike);

  for (const post of posts) {
    const postId = requireResolved(postIds, post.key);
    const commentCount = await commentRepository.count({ where: { postId } });
    const likeCount = await likeRepository.count({ where: { postId } });

    await postRepository.update(postId, {
      commentCount,
      likeCount,
      viewCount: post.viewCount,
    });
  }
};

const seedDemoData = async (): Promise<void> => {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  await dataSource.transaction(async (manager) => {
    const userIds = await ensureUsers(manager, passwordHash);
    const videoIds = await ensureVideos(manager);
    const tagIds = await ensureTags(manager);
    const postIds = await ensurePosts(manager, userIds, videoIds);

    await ensurePostTags(manager, postIds, tagIds);
    await ensurePostLikes(manager, postIds, userIds);
    const chunkIds = await ensureTranscriptChunks(manager, videoIds);
    await ensureComments(manager, postIds, userIds);
    await ensureCommentAnalyses(manager);
    await ensureRagEvidences(manager, chunkIds);
    await ensureSummaries(manager, postIds, userIds);
    await refreshPostCounters(manager, postIds);
  });
};

const main = async (): Promise<void> => {
  assertSeedAllowed();
  await dataSource.initialize();

  try {
    await seedDemoData();
    console.log('Demo seed data has been written.');
    console.log(`Admin account: demo-admin@arena.local / ${DEMO_PASSWORD}`);
    console.log(`User account: demo-minji@arena.local / ${DEMO_PASSWORD}`);
    console.log(`Seeded posts: ${posts.length}, comments: ${comments.length}`);
  } finally {
    await dataSource.destroy();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
