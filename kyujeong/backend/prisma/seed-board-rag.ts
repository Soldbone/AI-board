import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

type DemoCategory =
  | 'QUESTION'
  | 'RECIPE_SHARE'
  | 'COOKING_TIP_REVIEW'
  | 'TREND';

type DemoComment = {
  author: string;
  content: string;
};

type DemoPost = {
  author: string;
  category: DemoCategory;
  title: string;
  content: string;
  tags: string[];
  viewCount: number;
  comments: DemoComment[];
};

type PostImageTheme = {
  dishName: string;
  subtitle: string;
  baseColor: string;
  accentColor: string;
  garnishColor: string;
  backgroundColor: string;
};

const demoUsers = [
  { email: 'board-minji@example.com', nickname: '민지냉장고' },
  { email: 'board-seungwoo@example.com', nickname: '퇴근후10분' },
  { email: 'board-yuri@example.com', nickname: '유리식탁' },
  { email: 'board-hyun@example.com', nickname: '자취7년차' },
  { email: 'board-sora@example.com', nickname: '소라반찬' },
  { email: 'board-jun@example.com', nickname: '준셰프아님' },
  { email: 'board-hana@example.com', nickname: '하나도시락' },
  { email: 'board-dabin@example.com', nickname: '다빈마켓' },
  { email: 'board-yeon@example.com', nickname: '연두부러버' },
  { email: 'board-mango@example.com', nickname: '망고엄마' },
  { email: 'board-river@example.com', nickname: '한강라면' },
  { email: 'board-nari@example.com', nickname: '나리후추' },
];

const demoPosts: DemoPost[] = [
  {
    author: '민지냉장고',
    category: 'QUESTION',
    title: '감자 세 알이랑 양파 반 개, 반찬 뭐가 제일 무난할까요?',
    content:
      '감자가 애매하게 세 알 남았고 양파는 반 개 정도 있어요. 집에는 간장, 설탕, 고춧가루, 참기름은 있는데 고기는 없습니다. 내일 도시락 반찬으로 가져갈 거라 식어도 괜찮은 메뉴면 좋겠어요. 감자채볶음 말고 다른 선택지도 있을까요?',
    tags: ['감자', '양파', '도시락', '반찬'],
    viewCount: 18,
    comments: [
      {
        author: '소라반찬',
        content:
          '도시락이면 감자조림이 제일 안정적이에요. 물 조금 넉넉히 넣고 졸이면 식어도 퍽퍽하지 않아요.',
      },
      {
        author: '자취7년차',
        content:
          '양파 있으면 감자짜글이도 괜찮은데 국물이 있어서 도시락이면 조림 쪽 추천합니다.',
      },
    ],
  },
  {
    author: '퇴근후10분',
    category: 'QUESTION',
    title: '두부 한 모랑 계란 두 개로 저녁 버틸 수 있는 메뉴 있을까요',
    content:
      '오늘 너무 늦게 들어와서 장 보러 나가기는 힘들고 두부 한 모, 계란 두 개, 대파 조금 있습니다. 맵게 먹는 건 괜찮은데 설거지가 많아지는 건 싫어요. 밥은 있습니다.',
    tags: ['두부', '계란', '저녁', '간단요리'],
    viewCount: 25,
    comments: [
      {
        author: '연두부러버',
        content:
          '두부를 크게 부치고 계란물 부어서 간장 양념 올리면 한 팬으로 끝나요.',
      },
      {
        author: '준셰프아님',
        content:
          '마파두부처럼 해도 되는데 고기 없으면 고추장 조금에 대파기름만 내도 꽤 먹을 만합니다.',
      },
    ],
  },
  {
    author: '한강라면',
    category: 'QUESTION',
    title: '남은 족발이랑 찬밥 있는데 야식 말고 아침 메뉴로 가능할까요?',
    content:
      '어제 먹다 남은 족발이 꽤 있고 찬밥, 상추, 쌈장도 남았습니다. 아침에 너무 무겁지 않게 먹고 싶은데 족발은 데우면 냄새가 좀 날까 봐 고민이에요. 전자레인지 말고 좋은 방법 있으면 알려주세요.',
    tags: ['족발', '찬밥', '상추', '남은음식'],
    viewCount: 34,
    comments: [
      {
        author: '자취7년차',
        content:
          '팬에 물 한두 숟가락 넣고 뚜껑 덮어서 데우면 냄새가 덜해요. 밥은 조금만 넣고 상추랑 덮밥처럼 드세요.',
      },
    ],
  },
  {
    author: '소라반찬',
    category: 'RECIPE_SHARE',
    title: '식어도 맛있는 단짠 감자조림, 도시락용으로 자주 해요',
    content:
      '감자 3개 기준입니다. 감자는 한입 크기로 썰고 찬물에 5분만 담가 전분을 살짝 빼요. 팬에 감자, 물 반 컵, 간장 2큰술, 설탕 반 큰술, 올리고당 1큰술을 넣고 중약불로 12분 정도 졸입니다. 마지막 2분에 양파를 넣으면 흐물거리지 않고 단맛만 살아나요. 불 끄고 참기름 아주 조금, 깨 조금 넣으면 끝입니다. 도시락으로 가져갈 때는 국물을 거의 날려야 밥이 질척하지 않아요.',
    tags: ['감자', '감자조림', '도시락', '레시피공유'],
    viewCount: 91,
    comments: [
      {
        author: '민지냉장고',
        content:
          '이거 해봤는데 설탕 반 큰술이라 덜 달아서 좋았어요. 간장은 제 입맛엔 1.5큰술도 충분했습니다.',
      },
      {
        author: '망고엄마',
        content:
          '아이 반찬으로 할 때 고춧가루 없이 했고, 마지막에 물엿 아주 조금 더 넣으니 윤기가 나요.',
      },
      {
        author: '나리후추',
        content:
          '감자를 너무 작게 자르면 졸이다가 부서지더라고요. 큼직하게 자르는 게 포인트 같아요.',
      },
    ],
  },
  {
    author: '준셰프아님',
    category: 'RECIPE_SHARE',
    title: '고기 없어도 되는 마파두부 느낌 덮밥',
    content:
      '정통 마파두부는 아니고 집에 있는 양념으로 만드는 버전입니다. 두부 한 모는 키친타월로 물기를 조금 빼고 큼직하게 썰어요. 팬에 식용유, 대파, 다진 마늘을 넣고 향을 낸 다음 고추장 1큰술, 된장 반 작은술, 간장 1큰술, 물 150ml를 넣습니다. 끓으면 두부를 넣고 6~7분 정도 조립니다. 전분물 있으면 마지막에 살짝 넣고, 없으면 그냥 밥 위에 올려도 됩니다. 매운맛은 청양고추보다 고춧가루로 조절하는 게 덜 날카로워요.',
    tags: ['두부', '마파두부', '덮밥', '레시피공유'],
    viewCount: 76,
    comments: [
      {
        author: '퇴근후10분',
        content:
          '고기 없이 했는데도 된장 반 작은술 들어가니까 밍밍하지 않았어요. 설거지도 팬 하나라 좋았습니다.',
      },
      {
        author: '연두부러버',
        content:
          '전분물 없을 때 계란 하나 풀어 넣어도 소스가 잡혀요. 대신 마파두부보다는 순두부덮밥 느낌 납니다.',
      },
    ],
  },
  {
    author: '하나도시락',
    category: 'RECIPE_SHARE',
    title: '찬밥 처리용 대파 계란볶음밥, 기름 적게 하는 버전',
    content:
      '대파를 많이 넣으면 기름을 적게 써도 향이 살아납니다. 대파 흰 부분을 먼저 볶고, 계란은 팬 한쪽에서 스크램블처럼 익힌 뒤 찬밥을 넣어요. 간장은 밥 위가 아니라 팬 가장자리로 반 큰술만 둘러 태우듯 넣으면 향이 납니다. 김치나 햄이 없을 때도 충분히 괜찮고, 마지막에 후추를 조금 넣으면 느끼함이 줄어요.',
    tags: ['찬밥', '대파', '계란', '볶음밥'],
    viewCount: 64,
    comments: [
      {
        author: '다빈마켓',
        content:
          '간장 팬 가장자리에 넣는 거 차이 큽니다. 밥에 바로 넣으면 색만 진하고 향은 덜해요.',
      },
    ],
  },
  {
    author: '연두부러버',
    category: 'RECIPE_SHARE',
    title: '두부 부침을 반찬 말고 한 끼처럼 먹는 방법',
    content:
      '두부를 얇게 자르지 말고 손가락 두께 정도로 자릅니다. 소금은 거의 안 뿌리고 물기만 제거한 뒤 기름을 살짝 두른 팬에 앞뒤로 노릇하게 부쳐요. 양념장은 간장 1, 물 1, 식초 조금, 다진 대파, 고춧가루 약간을 섞습니다. 밥 위에 두부를 올리고 양념장을 반만 뿌린 뒤 계란프라이를 올리면 반찬이 아니라 덮밥처럼 먹을 수 있어요.',
    tags: ['두부', '계란', '덮밥', '반찬'],
    viewCount: 58,
    comments: [
      {
        author: '민지냉장고',
        content:
          '양념장에 물 넣는 게 좋네요. 그냥 간장만 쓰면 두부가 너무 짰는데 이건 밥이랑 맞아요.',
      },
    ],
  },
  {
    author: '자취7년차',
    category: 'RECIPE_SHARE',
    title: '남은 치킨으로 하는 양배추 볶음면',
    content:
      '치킨 몇 조각이 남았을 때 살만 발라두고 양배추를 넉넉히 썰어 볶습니다. 면은 라면사리나 우동면 아무거나 됩니다. 양념은 굴소스 반 큰술, 간장 반 큰술, 후추 정도만 넣어요. 치킨 자체가 이미 짭짤해서 양념을 많이 넣으면 바로 짜집니다. 양배추에서 물이 나오니까 센 불로 짧게 볶는 게 좋아요.',
    tags: ['치킨', '양배추', '볶음면', '남은음식'],
    viewCount: 49,
    comments: [
      {
        author: '한강라면',
        content:
          '라면스프 안 넣어도 되나요?',
      },
      {
        author: '자취7년차',
        content:
          '스프 넣으면 맛은 강해지는데 많이 짜요. 넣는다면 1/4봉지만 추천합니다.',
      },
    ],
  },
  {
    author: '민지냉장고',
    category: 'COOKING_TIP_REVIEW',
    title: '백종원식 감자조림 따라 했다가 제 입맛에 맞춘 후기',
    content:
      '처음에는 레시피대로 간장 3큰술 가까이 넣었는데 제 입에는 꽤 짰습니다. 두 번째부터는 감자 3개 기준 간장 1.5~2큰술, 설탕 반 큰술로 줄였고 훨씬 낫더라고요. 물은 처음에 적게 넣으면 감자가 익기 전에 양념이 타서 반 컵 정도는 넣는 게 안전했습니다. 저는 양파를 처음부터 넣으니 너무 물러져서 마지막 3분에 넣는 쪽이 좋았어요. 결론은 간장 줄이고 설탕 줄이고, 대신 약불로 조금 더 졸이는 방식 추천합니다.',
    tags: ['감자조림', '후기', '간조절', '도시락'],
    viewCount: 83,
    comments: [
      {
        author: '소라반찬',
        content:
          '맞아요. 감자조림은 식으면 더 짜게 느껴져서 도시락이면 간장 줄이는 게 좋습니다.',
      },
      {
        author: '나리후추',
        content:
          '저는 설탕 대신 올리고당으로 마무리만 했더니 덜 달고 윤기만 나서 좋았어요.',
      },
    ],
  },
  {
    author: '한강라면',
    category: 'COOKING_TIP_REVIEW',
    title: '남은 족발 전자레인지 말고 팬에 데워본 후기',
    content:
      '전자레인지에 돌렸을 때는 가장자리가 딱딱해져서 별로였는데, 팬에 물 2큰술 넣고 뚜껑 덮어서 약불로 4분 정도 데우니까 훨씬 촉촉했습니다. 냄새가 걱정되면 대파나 마늘을 조금 같이 넣으면 괜찮아요. 저는 데운 족발을 잘게 자르고 찬밥 반 공기, 쌈장 아주 조금 넣어서 볶았는데 야식 느낌은 강하지만 맛은 좋았습니다. 쌈장은 많이 넣으면 바로 짜요.',
    tags: ['족발', '남은음식', '데우기', '후기'],
    viewCount: 102,
    comments: [
      {
        author: '퇴근후10분',
        content:
          '이 방식으로 했더니 진짜 덜 질겼어요. 물 넣는 게 핵심인 듯합니다.',
      },
      {
        author: '하나도시락',
        content:
          '아침으로 먹을 거면 볶음밥보다 상추 덮밥처럼 먹는 게 덜 무거웠어요.',
      },
    ],
  },
  {
    author: '망고엄마',
    category: 'COOKING_TIP_REVIEW',
    title: '마파두부 해봤는데 아이랑 먹으려면 이렇게 바꾸는 게 낫네요',
    content:
      '마파두부 레시피를 그대로 하면 고추장 향이 세고 매워서 아이가 먹기 어려웠습니다. 저는 고추장을 반 큰술로 줄이고 케첩을 아주 조금 넣었어요. 어른 입맛에는 덜 마파두부 같지만 두부덮밥으로는 괜찮았습니다. 두부는 끓일 때 자꾸 젓지 말고 팬을 흔드는 정도로만 해야 덜 부서집니다. 마지막에 참기름을 넣으면 고추장 맛이 조금 둥글어져요.',
    tags: ['마파두부', '후기', '아이반찬', '두부'],
    viewCount: 47,
    comments: [
      {
        author: '연두부러버',
        content:
          '두부를 소금물에 2분 정도 담갔다 쓰면 더 단단해서 덜 부서져요.',
      },
    ],
  },
  {
    author: '나리후추',
    category: 'COOKING_TIP_REVIEW',
    title: '대파 계란볶음밥, 간장보다 소금이 나았던 날',
    content:
      '간장을 팬 가장자리에 넣는 방식도 맛있는데, 김이랑 같이 먹을 때는 간장까지 넣으면 짰습니다. 대파 향을 충분히 내고 소금 한 꼬집, 후추로만 맞추니까 더 깔끔했어요. 대신 색은 덜 예쁩니다. 도시락으로 싸면 간장이 들어간 버전보다 냄새가 덜 올라오는 느낌도 있었습니다.',
    tags: ['대파', '계란볶음밥', '후기', '저염'],
    viewCount: 39,
    comments: [
      {
        author: '하나도시락',
        content:
          '도시락 냄새 얘기 공감합니다. 간장 볶음밥은 열었을 때 향이 꽤 올라와요.',
      },
    ],
  },
  {
    author: '다빈마켓',
    category: 'TREND',
    title: '이번 주 마트는 대파랑 양배추가 확실히 싸네요',
    content:
      '동네 마트 기준으로 대파 한 단이 평소보다 많이 싸고 양배추도 행사 중이었습니다. 그래서 게시판에도 대파 계란볶음밥, 양배추 볶음면 글이 자주 보이는 것 같아요. 냉장고 비우기 관점에서는 대파는 향 내는 용도, 양배추는 양 늘리는 용도로 좋아서 둘 다 활용도가 높습니다.',
    tags: ['대파', '양배추', '마트', '트렌드'],
    viewCount: 55,
    comments: [
      {
        author: '자취7년차',
        content:
          '양배추 싸면 볶음면이나 오코노미야키 느낌 부침으로 처리하기 좋죠.',
      },
    ],
  },
  {
    author: '유리식탁',
    category: 'TREND',
    title: '요즘 게시판에 두부 덮밥 글이 많아진 이유가 있는 듯',
    content:
      '최근 글을 보면 두부, 계란, 대파 조합이 많이 올라옵니다. 장을 크게 보지 않아도 한 끼가 되고, 고기 없이도 단백질 느낌이 있어서 그런 것 같아요. 특히 마파두부 느낌으로 먹거나 두부부침을 덮밥처럼 먹는 방식이 반응이 좋습니다.',
    tags: ['두부', '계란', '덮밥', '트렌드'],
    viewCount: 44,
    comments: [
      {
        author: '퇴근후10분',
        content:
          '퇴근하고 만들기 쉬운 재료라 그런 듯해요. 두부는 실패해도 먹을 수는 있어서 부담이 적습니다.',
      },
    ],
  },
  {
    author: '나리후추',
    category: 'TREND',
    title: '남은 배달음식 활용 글 중에는 족발이 제일 반응 좋은 편',
    content:
      '치킨은 볶음밥이나 샐러드로 많이 가고, 족발은 데우는 방법을 물어보는 글이 많습니다. 족발은 잘못 데우면 질겨져서 그런지 팁 글에 댓글이 잘 붙어요. 최근에는 족발 덮밥, 족발 볶음밥보다 상추를 곁들인 덮밥식 구성이 덜 무겁다는 반응이 있었습니다.',
    tags: ['족발', '배달음식', '남은음식', '트렌드'],
    viewCount: 61,
    comments: [
      {
        author: '한강라면',
        content:
          '맞아요. 족발은 조리보다 데우기가 핵심이라 팁 글이 더 도움 됩니다.',
      },
    ],
  },
  {
    author: '유리식탁',
    category: 'QUESTION',
    title: '양배추 반 통 남았는데 볶음 말고 뭐가 좋을까요?',
    content:
      '양배추가 반 통 남았고 계란, 부침가루 조금 있습니다. 맨날 볶아 먹어서 다른 방식으로 처리하고 싶어요. 소스는 돈가스소스, 마요네즈, 간장 있습니다.',
    tags: ['양배추', '계란', '질문'],
    viewCount: 17,
    comments: [
      {
        author: '자취7년차',
        content:
          '부침가루 있으면 양배추전 추천해요. 돈가스소스랑 마요네즈 조금이면 오코노미야키 느낌 납니다.',
      },
    ],
  },
  {
    author: '다빈마켓',
    category: 'QUESTION',
    title: '김치가 너무 쉬었는데 볶음밥 말고 살릴 방법 있을까요',
    content:
      '김치가 많이 익어서 그냥 먹기는 시고, 김치볶음밥은 어제 먹었습니다. 두부나 참치캔은 없고 양파, 대파, 계란은 있어요. 국물 요리로 가야 할까요?',
    tags: ['김치', '대파', '계란', '질문'],
    viewCount: 23,
    comments: [
      {
        author: '준셰프아님',
        content:
          '많이 쉬었으면 설탕 아주 조금 넣고 김치국처럼 끓이는 게 나아요. 계란은 마지막에 풀면 됩니다.',
      },
    ],
  },
  {
    author: '퇴근후10분',
    category: 'COOKING_TIP_REVIEW',
    title: '두부 계란부침 해먹은 짧은 후기',
    content:
      '두부 물기를 대충 빼고 했더니 기름이 많이 튀었습니다. 다음에는 키친타월로 더 눌러야겠어요. 맛은 간장 양념보다 쪽파 넣은 초간장이 더 나았습니다.',
    tags: ['두부', '계란', '후기'],
    viewCount: 28,
    comments: [
      {
        author: '연두부러버',
        content:
          '전자레인지에 두부 1분 돌리고 물 빼면 덜 튀어요.',
      },
    ],
  },
  {
    author: '하나도시락',
    category: 'COOKING_TIP_REVIEW',
    title: '도시락에 볶음밥 넣을 때 제가 하는 작은 팁',
    content:
      '볶음밥을 바로 용기에 넣으면 김이 차서 밥이 질어집니다. 접시에 5분만 펼쳐서 식힌 뒤 담으면 훨씬 낫습니다. 간도 막 했을 때보다 식은 뒤 더 세게 느껴지니까 간장은 조금 덜 넣는 편이 좋아요. 김치볶음밥은 특히 그렇습니다.',
    tags: ['도시락', '볶음밥', '요리팁'],
    viewCount: 42,
    comments: [
      {
        author: '민지냉장고',
        content:
          '이거 진짜 중요해요. 뜨거울 때 뚜껑 닫으면 점심에 밥이 뭉쳐 있습니다.',
      },
    ],
  },
  {
    author: '유리식탁',
    category: 'RECIPE_SHARE',
    title: '신 김치로 끓이는 김치계란국, 볶음밥 질릴 때 좋아요',
    content:
      '김치가 너무 쉬었을 때 볶음밥 말고 국으로 돌리는 방법입니다. 냄비에 김치를 먼저 2분 정도 볶고 물을 부어요. 양파나 대파가 있으면 같이 넣고, 간은 김치 국물로 먼저 맞춘 뒤 부족할 때만 국간장 반 큰술 정도 넣습니다. 마지막에 계란을 풀어 넣으면 신맛이 조금 부드러워져요. 설탕은 아주 조금만 넣어야 김치찌개처럼 달아지지 않습니다.',
    tags: ['김치', '계란', '국물요리', '레시피공유'],
    viewCount: 52,
    comments: [
      {
        author: '다빈마켓',
        content:
          '쉬어버린 김치 처리할 때 좋겠네요. 계란 넣으면 확실히 신맛이 덜 튀어요.',
      },
    ],
  },
  {
    author: '자취7년차',
    category: 'RECIPE_SHARE',
    title: '양배추 반 통 처리하는 양배추전',
    content:
      '양배추는 최대한 얇게 채 썰고 계란 1개, 부침가루 3큰술, 물 조금만 넣어 반죽합니다. 반죽이 묽으면 뒤집을 때 찢어져서 양배추에 겨우 묻는 정도가 좋습니다. 약불보다 중불에서 가장자리를 먼저 바삭하게 잡고 뒤집어야 모양이 유지돼요. 돈가스소스랑 마요네즈를 조금만 뿌리면 오코노미야키 비슷한 느낌이 납니다.',
    tags: ['양배추', '계란', '부침', '레시피공유'],
    viewCount: 71,
    comments: [
      {
        author: '유리식탁',
        content:
          '부침가루 적게 넣는 게 좋네요. 저는 많이 넣었다가 밀가루떡처럼 됐어요.',
      },
      {
        author: '한강라면',
        content:
          '라면 먹을 때 옆에 같이 해먹어도 잘 어울렸습니다.',
      },
    ],
  },
  {
    author: '망고엄마',
    category: 'RECIPE_SHARE',
    title: '참치캔 하나로 만드는 두부쌈장 비빔밥',
    content:
      '참치캔 기름은 반만 빼고 두부 반 모를 으깨서 같이 볶습니다. 쌈장 1큰술, 물 2큰술, 다진 대파를 넣고 약불에서 섞으면 짜지 않은 비빔장이 됩니다. 밥 위에 올리고 상추나 깻잎을 잘라 넣으면 한 그릇으로 먹기 좋아요. 쌈장을 많이 넣으면 금방 짜지니까 두부 양을 넉넉히 잡는 게 포인트입니다.',
    tags: ['참치', '두부', '쌈장', '비빔밥'],
    viewCount: 63,
    comments: [
      {
        author: '나리후추',
        content:
          '두부가 들어가서 쌈장 짠맛이 줄어드는 게 좋았습니다. 상추 있으면 꼭 넣는 쪽 추천해요.',
      },
    ],
  },
  {
    author: '다빈마켓',
    category: 'COOKING_TIP_REVIEW',
    title: '신 김치계란국 해본 후기, 설탕은 진짜 조금만',
    content:
      '신 김치가 많아서 김치계란국을 해봤습니다. 김치를 먼저 볶고 물을 넣으니 군내가 덜했고, 계란을 넣으니까 신맛이 둥글어졌어요. 다만 설탕을 반 큰술 넣었더니 제 입에는 조금 달았습니다. 김치 양이 많지 않으면 설탕은 한 꼬집 정도면 충분할 것 같아요. 대파는 처음부터 넣는 것보다 마지막에 넣는 게 향이 낫습니다.',
    tags: ['김치', '계란국', '후기', '간조절'],
    viewCount: 38,
    comments: [
      {
        author: '유리식탁',
        content:
          '설탕 많이 넣으면 김치국 맛이 애매해지죠. 신맛만 눌러주는 정도가 좋은 것 같아요.',
      },
    ],
  },
  {
    author: '한강라면',
    category: 'COOKING_TIP_REVIEW',
    title: '양배추전 첫 시도 망한 후기입니다',
    content:
      '양배추를 굵게 썰고 반죽을 묽게 했더니 뒤집는 순간 다 흩어졌습니다. 맛은 있었는데 모양이 전이 아니라 볶음이 됐어요. 두 번째는 양배추를 얇게 썰고 계란을 하나 더 넣었더니 훨씬 잘 붙었습니다. 소스는 돈가스소스만 쓰면 달아서 마요네즈를 조금 섞는 게 낫고, 간장은 별로 안 어울렸습니다.',
    tags: ['양배추', '부침', '실패후기', '요리팁'],
    viewCount: 45,
    comments: [
      {
        author: '자취7년차',
        content:
          '양배추전은 채칼 쓰면 성공률 올라갑니다. 굵으면 거의 무조건 흩어져요.',
      },
    ],
  },
  {
    author: '소라반찬',
    category: 'COOKING_TIP_REVIEW',
    title: '참치 두부쌈장 비빔밥, 도시락으로는 물기 조심',
    content:
      '맛은 좋았는데 도시락으로 싸려면 두부 물기를 더 빼야 합니다. 아침에 대충 으깨서 볶았더니 점심에 밥이 조금 질어졌어요. 두부를 먼저 팬에서 2분 정도 볶아 수분을 날리고 참치를 넣으면 훨씬 낫습니다. 쌈장은 한 큰술이면 충분했고, 김가루를 넣으면 간이 더 세져서 쌈장은 조금 줄이는 게 좋아요.',
    tags: ['참치', '두부', '도시락', '후기'],
    viewCount: 57,
    comments: [
      {
        author: '하나도시락',
        content:
          '도시락이면 두부 수분 진짜 중요해요. 저는 밥이랑 비빔장을 따로 담습니다.',
      },
    ],
  },
  {
    author: '하나도시락',
    category: 'TREND',
    title: '도시락 글은 요즘 간 조절 후기까지 같이 보는 사람이 많은 듯해요',
    content:
      '최근 도시락 관련 글을 보면 레시피 자체보다 식었을 때 짠지, 물기가 생기는지, 냄새가 나는지 같은 후기가 더 도움이 된다는 댓글이 많습니다. 감자조림이나 볶음밥도 바로 먹는 기준과 도시락 기준이 다르더라고요. RAG가 이런 후기까지 같이 참고하면 답변이 훨씬 현실적일 것 같습니다.',
    tags: ['도시락', '후기', '간조절', '트렌드'],
    viewCount: 36,
    comments: [
      {
        author: '민지냉장고',
        content:
          '맞아요. 그냥 맛있는 레시피랑 도시락으로 좋은 레시피는 다르더라고요.',
      },
    ],
  },
  {
    author: '준셰프아님',
    category: 'TREND',
    title: '요즘은 레시피보다 실패 후기가 은근 검색에 더 도움 됩니다',
    content:
      '레시피 공유글은 기본 방향을 잡기 좋고, 실패 후기는 실제 조절 포인트를 알려줘서 좋습니다. 예를 들면 감자조림은 간장 양, 양배추전은 반죽 농도, 족발은 데우는 방식 같은 부분이 댓글과 후기에서 더 잘 나옵니다. 질문글만 모아두면 이런 정보가 쌓이지 않는다는 걸 요즘 게시판 보면서 느꼈습니다.',
    tags: ['RAG', '후기', '레시피공유', '트렌드'],
    viewCount: 40,
    comments: [
      {
        author: '연두부러버',
        content:
          '실패 후기는 진짜 중요해요. 성공 레시피보다 어느 부분에서 망하는지 알려줘서요.',
      },
    ],
  },
];

const postImageThemes: Array<{
  keywords: string[];
  theme: PostImageTheme;
}> = [
  {
    keywords: ['감자', '감자조림'],
    theme: {
      dishName: '단짠 감자조림',
      subtitle: '도시락 반찬',
      baseColor: '#d9a441',
      accentColor: '#8b4b24',
      garnishColor: '#4f8f3a',
      backgroundColor: '#fff4d6',
    },
  },
  {
    keywords: ['마파두부'],
    theme: {
      dishName: '마파두부 덮밥',
      subtitle: '고기 없이도 든든하게',
      baseColor: '#f3efe8',
      accentColor: '#c33a27',
      garnishColor: '#3b8d46',
      backgroundColor: '#ffe4dc',
    },
  },
  {
    keywords: ['계란볶음밥', '볶음밥', '찬밥'],
    theme: {
      dishName: '대파 계란볶음밥',
      subtitle: '찬밥 처리 한 그릇',
      baseColor: '#f4d166',
      accentColor: '#f7f2db',
      garnishColor: '#3f9d56',
      backgroundColor: '#fff0bf',
    },
  },
  {
    keywords: ['두부쌈장', '참치', '비빔밥'],
    theme: {
      dishName: '참치 두부쌈장',
      subtitle: '짠맛 줄인 비빔밥',
      baseColor: '#f3ead9',
      accentColor: '#9d5a31',
      garnishColor: '#4e9f60',
      backgroundColor: '#e9f6df',
    },
  },
  {
    keywords: ['두부', '두부 부침', '계란부침'],
    theme: {
      dishName: '두부 계란부침',
      subtitle: '반찬 같은 한 끼',
      baseColor: '#f6f0d2',
      accentColor: '#f4c84a',
      garnishColor: '#4a9852',
      backgroundColor: '#fff7d8',
    },
  },
  {
    keywords: ['족발'],
    theme: {
      dishName: '남은 족발 데우기',
      subtitle: '촉촉하게 다시 한 번',
      baseColor: '#9a4f32',
      accentColor: '#e7c7a0',
      garnishColor: '#5aa04d',
      backgroundColor: '#f5e1cf',
    },
  },
  {
    keywords: ['김치계란국', '김치', '계란국'],
    theme: {
      dishName: '김치계란국',
      subtitle: '신 김치 활용 국물',
      baseColor: '#d84a32',
      accentColor: '#ffd56c',
      garnishColor: '#4b9b53',
      backgroundColor: '#ffe1d6',
    },
  },
  {
    keywords: ['양배추전', '양배추', '부침'],
    theme: {
      dishName: '양배추전',
      subtitle: '얇게 채 썰어 바삭하게',
      baseColor: '#d9edba',
      accentColor: '#f0d060',
      garnishColor: '#58a756',
      backgroundColor: '#eef9d8',
    },
  },
  {
    keywords: ['치킨', '볶음면', '양배추 볶음면'],
    theme: {
      dishName: '치킨 양배추 볶음면',
      subtitle: '남은 치킨 활용',
      baseColor: '#e2b366',
      accentColor: '#f2e5c6',
      garnishColor: '#59a25a',
      backgroundColor: '#fff0d3',
    },
  },
];

function resolvePostImageTheme(post: DemoPost) {
  if (
    post.category !== 'RECIPE_SHARE' &&
    post.category !== 'COOKING_TIP_REVIEW'
  ) {
    return null;
  }

  const searchableText = [post.title, post.content, ...post.tags].join(' ');

  return (
    postImageThemes.find(({ keywords }) =>
      keywords.some((keyword) => searchableText.includes(keyword)),
    )?.theme ?? {
      dishName: '집밥 레시피',
      subtitle: post.category === 'RECIPE_SHARE' ? '레시피 공유' : '요리 후기',
      baseColor: '#f1d18a',
      accentColor: '#8d6b45',
      garnishColor: '#5aa05d',
      backgroundColor: '#f8eedb',
    }
  );
}

function createPostImageUrl(post: DemoPost) {
  const theme = resolvePostImageTheme(post);

  if (!theme) {
    return null;
  }

  const badgeLabel =
    post.category === 'RECIPE_SHARE' ? 'RECIPE' : 'REVIEW';
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640">
  <rect width="960" height="640" fill="${theme.backgroundColor}"/>
  <circle cx="720" cy="130" r="82" fill="#ffffff" opacity="0.45"/>
  <circle cx="190" cy="520" r="110" fill="#ffffff" opacity="0.35"/>
  <rect x="92" y="86" width="776" height="468" rx="42" fill="#fffaf1"/>
  <ellipse cx="480" cy="336" rx="256" ry="146" fill="#f7efe0"/>
  <ellipse cx="480" cy="332" rx="218" ry="112" fill="${theme.baseColor}"/>
  <circle cx="386" cy="298" r="48" fill="${theme.accentColor}" opacity="0.95"/>
  <circle cx="518" cy="355" r="54" fill="${theme.accentColor}" opacity="0.88"/>
  <circle cx="588" cy="288" r="34" fill="#ffffff" opacity="0.6"/>
  <path d="M344 398c80 34 196 34 272 0" fill="none" stroke="#6e5138" stroke-width="16" stroke-linecap="round" opacity="0.24"/>
  <circle cx="424" cy="252" r="13" fill="${theme.garnishColor}"/>
  <circle cx="556" cy="405" r="12" fill="${theme.garnishColor}"/>
  <circle cx="632" cy="342" r="10" fill="${theme.garnishColor}"/>
  <rect x="126" y="116" width="112" height="36" rx="18" fill="#1f2a24"/>
  <text x="182" y="140" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="#ffffff">${badgeLabel}</text>
  <text x="480" y="510" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" font-weight="800" fill="#243029">${theme.dishName}</text>
  <text x="480" y="552" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#68746c">${theme.subtitle}</text>
</svg>`.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

async function upsertDemoUsers() {
  const passwordHash = await bcrypt.hash('demo1234', 10);
  const users = new Map<string, { id: number; nickname: string }>();

  for (const user of demoUsers) {
    const savedUser = await prisma.user.upsert({
      where: { email: user.email },
      update: {
        nickname: user.nickname,
      },
      create: {
        email: user.email,
        passwordHash,
        nickname: user.nickname,
      },
      select: {
        id: true,
        nickname: true,
      },
    });

    users.set(savedUser.nickname, savedUser);
  }

  return users;
}

async function replacePostTags(postId: number, tags: string[]) {
  await prisma.postTag.deleteMany({ where: { postId } });

  for (const tagName of tags) {
    await prisma.postTag.create({
      data: {
        post: {
          connect: { id: postId },
        },
        tag: {
          connectOrCreate: {
            where: { name: tagName },
            create: { name: tagName },
          },
        },
      },
    });
  }
}

async function replacePostComments(
  postId: number,
  comments: DemoComment[],
  users: Map<string, { id: number; nickname: string }>,
) {
  await prisma.comment.deleteMany({ where: { postId } });

  for (const comment of comments) {
    const author = users.get(comment.author);

    if (!author) {
      throw new Error(`Unknown comment author: ${comment.author}`);
    }

    await prisma.comment.create({
      data: {
        postId,
        authorId: author.id,
        content: comment.content,
      },
    });
  }
}

async function main() {
  const users = await upsertDemoUsers();

  for (const post of demoPosts) {
    const author = users.get(post.author);

    if (!author) {
      throw new Error(`Unknown post author: ${post.author}`);
    }

    const existingPost = await prisma.post.findFirst({
      where: {
        title: post.title,
        authorId: author.id,
      },
      select: {
        id: true,
      },
    });

	    const savedPost = existingPost
	      ? await prisma.post.update({
	          where: { id: existingPost.id },
	          data: {
	            title: post.title,
	            content: post.content,
	            imageUrl: createPostImageUrl(post),
	            category: post.category as never,
	            viewCount: post.viewCount,
	          },
          select: {
            id: true,
          },
        })
      : await prisma.post.create({
	          data: {
	            title: post.title,
	            content: post.content,
	            imageUrl: createPostImageUrl(post),
	            category: post.category as never,
	            authorId: author.id,
	            viewCount: post.viewCount,
          },
          select: {
            id: true,
          },
        });

    await replacePostTags(savedPost.id, post.tags);
    await replacePostComments(savedPost.id, post.comments, users);
    await prisma.postRagDocument.updateMany({
      where: { postId: savedPost.id },
      data: { isStale: true },
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    process.exit(1);
  });
