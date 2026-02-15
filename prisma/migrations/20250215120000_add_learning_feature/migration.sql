-- 学習モジュール
CREATE TABLE IF NOT EXISTS "LearningModule" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "icon" TEXT NOT NULL,
    "estimatedTime" INTEGER NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningModule_pkey" PRIMARY KEY ("id")
);

-- レッスン
CREATE TABLE IF NOT EXISTS "Lesson" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "simpleContent" TEXT NOT NULL,
    "detailedContent" TEXT NOT NULL,
    "technicalContent" TEXT NOT NULL,
    "relatedTermSlugs" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- クイズ
CREATE TABLE IF NOT EXISTS "Quiz" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "passingScore" INTEGER NOT NULL DEFAULT 70,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- クイズ問題
CREATE TABLE IF NOT EXISTS "QuizQuestion" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctOption" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);

-- 用語辞典
CREATE TABLE IF NOT EXISTS "Term" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "category" TEXT NOT NULL,
    "simpleDescription" TEXT NOT NULL,
    "detailedDescription" TEXT NOT NULL,
    "technicalDescription" TEXT NOT NULL,
    "formula" TEXT,
    "example" TEXT,
    "relatedTermSlugs" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Term_pkey" PRIMARY KEY ("id")
);

-- ユーザーモジュール進捗
CREATE TABLE IF NOT EXISTS "UserModuleProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserModuleProgress_pkey" PRIMARY KEY ("id")
);

-- ユーザーレッスン進捗
CREATE TABLE IF NOT EXISTS "UserLessonProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "readLevel" TEXT NOT NULL DEFAULT 'simple',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserLessonProgress_pkey" PRIMARY KEY ("id")
);

-- ユーザークイズ履歴
CREATE TABLE IF NOT EXISTS "UserQuizAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "correctCount" INTEGER NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserQuizAttempt_pkey" PRIMARY KEY ("id")
);

-- ユニークインデックス
CREATE UNIQUE INDEX IF NOT EXISTS "LearningModule_slug_key" ON "LearningModule"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Lesson_moduleId_slug_key" ON "Lesson"("moduleId", "slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Term_slug_key" ON "Term"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "UserModuleProgress_userId_moduleId_key" ON "UserModuleProgress"("userId", "moduleId");
CREATE UNIQUE INDEX IF NOT EXISTS "UserLessonProgress_userId_lessonId_key" ON "UserLessonProgress"("userId", "lessonId");

-- インデックス
CREATE INDEX IF NOT EXISTS "LearningModule_category_idx" ON "LearningModule"("category");
CREATE INDEX IF NOT EXISTS "LearningModule_order_idx" ON "LearningModule"("order");
CREATE INDEX IF NOT EXISTS "Lesson_moduleId_order_idx" ON "Lesson"("moduleId", "order");
CREATE INDEX IF NOT EXISTS "Quiz_moduleId_idx" ON "Quiz"("moduleId");
CREATE INDEX IF NOT EXISTS "QuizQuestion_quizId_order_idx" ON "QuizQuestion"("quizId", "order");
CREATE INDEX IF NOT EXISTS "Term_category_idx" ON "Term"("category");
CREATE INDEX IF NOT EXISTS "Term_name_idx" ON "Term"("name");
CREATE INDEX IF NOT EXISTS "UserModuleProgress_userId_idx" ON "UserModuleProgress"("userId");
CREATE INDEX IF NOT EXISTS "UserLessonProgress_userId_idx" ON "UserLessonProgress"("userId");
CREATE INDEX IF NOT EXISTS "UserQuizAttempt_userId_idx" ON "UserQuizAttempt"("userId");
CREATE INDEX IF NOT EXISTS "UserQuizAttempt_quizId_idx" ON "UserQuizAttempt"("quizId");

-- 外部キー制約
ALTER TABLE "Lesson" DROP CONSTRAINT IF EXISTS "Lesson_moduleId_fkey";
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "LearningModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Quiz" DROP CONSTRAINT IF EXISTS "Quiz_moduleId_fkey";
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "LearningModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuizQuestion" DROP CONSTRAINT IF EXISTS "QuizQuestion_quizId_fkey";
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserModuleProgress" DROP CONSTRAINT IF EXISTS "UserModuleProgress_userId_fkey";
ALTER TABLE "UserModuleProgress" ADD CONSTRAINT "UserModuleProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserModuleProgress" DROP CONSTRAINT IF EXISTS "UserModuleProgress_moduleId_fkey";
ALTER TABLE "UserModuleProgress" ADD CONSTRAINT "UserModuleProgress_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "LearningModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserLessonProgress" DROP CONSTRAINT IF EXISTS "UserLessonProgress_userId_fkey";
ALTER TABLE "UserLessonProgress" ADD CONSTRAINT "UserLessonProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserLessonProgress" DROP CONSTRAINT IF EXISTS "UserLessonProgress_lessonId_fkey";
ALTER TABLE "UserLessonProgress" ADD CONSTRAINT "UserLessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserQuizAttempt" DROP CONSTRAINT IF EXISTS "UserQuizAttempt_userId_fkey";
ALTER TABLE "UserQuizAttempt" ADD CONSTRAINT "UserQuizAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserQuizAttempt" DROP CONSTRAINT IF EXISTS "UserQuizAttempt_quizId_fkey";
ALTER TABLE "UserQuizAttempt" ADD CONSTRAINT "UserQuizAttempt_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;
