pipeline {
    agent any

    options {
        timeout(time: 1, unit: 'HOURS')
        buildDiscarder(logRotator(numToKeepStr: '30', artifactNumToKeepStr: '10'))
        timestamps()
        ansiColor('xterm')
    }

    environment {
        REGISTRY = 'ghcr.io'
        DOCKER_BUILDKIT = '1'
        NPM_CONFIG_CACHE = "${WORKSPACE}/.npm-cache"
        PNPM_HOME = "${WORKSPACE}/.pnpm-store"
    }

    stages {
        stage('Initialize') {
            steps {
                script {
                    env.GIT_SHA = sh(script: "git rev-parse --short HEAD", returnStdout: true).trim()
                    env.BRANCH_NAME = env.BRANCH_NAME ?: sh(script: "git rev-parse --abbrev-ref HEAD", returnStdout: true).trim()
                    
                    def gitUrl = sh(script: "git config --get remote.origin.url", returnStdout: true).trim()
                    env.GITHUB_ORG = sh(script: "echo '${gitUrl}' | sed -E 's/.*github.com[:\\/]([^\\/]+)\\/.*/\\1/'", returnStdout: true).trim().toLowerCase()
                    
                    // Repo name for GHCR specification
                    env.REPO_NAME = 'easydev-file-upload-service'
                    env.IMAGE_VERSION = sh(script: "node -p \"require('./package.json').version\" 2>/dev/null || echo ''", returnStdout: true).trim()
                    env.IMAGE_PATH = "${env.GITHUB_ORG}/${env.REPO_NAME}"
                    
                    echo "Starting Build for ${env.REPO_NAME} on branch ${env.BRANCH_NAME} (Commit: ${env.GIT_SHA})"
                }
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'pnpm install --frozen-lockfile --prefer-offline --config.dangerously-allow-all-scripts=true'
            }
        }

        stage('Lint') {
            steps {
                script {
                    if (sh(script: "grep -q '\"lint\":' package.json && echo 'true' || echo 'false'", returnStdout: true).trim() == 'true') {
                        sh 'pnpm run lint'
                    } else {
                        echo "No lint script found, skipping."
                    }
                }
            }
        }

        stage('Unit Tests') {
            steps {
                script {
                    if (sh(script: "grep -q '\"test\":' package.json && echo 'true' || echo 'false'", returnStdout: true).trim() == 'true') {
                        sh 'pnpm run test --passWithNoTests'
                    } else {
                        echo "No test script found, skipping."
                    }
                }
            }
        }

        stage('Build Application') {
            steps {
                script {
                    if (sh(script: "grep -q '\"build\":' package.json && echo 'true' || echo 'false'", returnStdout: true).trim() == 'true') {
                        sh 'pnpm run build'
                    } else {
                        echo "No build script found, skipping."
                    }
                }
            }
        }

        stage('docker build --platform linux/arm64') {
            steps {
                script {
                    def tagLatest = "${REGISTRY}/${env.IMAGE_PATH}:latest"
                    def tagSha = "${REGISTRY}/${env.IMAGE_PATH}:${env.GIT_SHA}"
                    def tagVersion = env.IMAGE_VERSION ? "-t ${REGISTRY}/${env.IMAGE_PATH}:${env.IMAGE_VERSION}" : ""
                    
                    sh "docker build --platform linux/arm64 --build-arg BUILDKIT_INLINE_CACHE=1 \
                        -t ${tagLatest} \
                        -t ${tagSha} \
                        ${tagVersion} \
                        --cache-from ${tagLatest} \
                        -f Dockerfile ."
                }
            }
        }

        stage('Docker Push to GHCR') {
            when {
                expression {
                    return env.BRANCH_NAME == 'main' || env.BRANCH_NAME == 'master' || env.BRANCH_NAME.startsWith('release/')
                }
            }
            steps {
                withCredentials([usernamePassword(credentialsId: 'ghcr-credentials', usernameVariable: 'GHCR_USER', passwordVariable: 'GHCR_TOKEN')]) {
                    sh 'echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USER}" --password-stdin'
                    sh "docker push ${REGISTRY}/${env.IMAGE_PATH}:latest"
                    sh "docker push ${REGISTRY}/${env.IMAGE_PATH}:${env.GIT_SHA}"
                    script {
                        if (env.IMAGE_VERSION) {
                            sh "docker push ${REGISTRY}/${env.IMAGE_PATH}:${env.IMAGE_VERSION}"
                        }
                    }
                }
            }
        }
    }

    post {
        always {
            script {
                echo "Cleaning up local images..."
                sh "docker rmi ${REGISTRY}/${env.IMAGE_PATH}:${env.GIT_SHA} || true"
                cleanWs(deleteDirs: true, disableDeferredWipeout: true)
            }
        }
    }
}

